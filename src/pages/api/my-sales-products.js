/* API: resumen de productos vendidos para el vendedor autenticado. */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, getSupabaseAdminConfigStatus } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";

/* Estados de orden que cuentan como venta real. */
const allowedOrderStatuses = new Set(["approved", "pending"]);

/* Parsea cantidad y precio a números seguros. */
const toPositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const extractBuyerNote = (paymentDetail) => {
  const detail = String(paymentDetail ?? "").trim();
  const marker = "note:";
  const index = detail.indexOf(marker);
  if (index < 0) return "";
  return detail.slice(index + marker.length).trim();
};

/* Resuelve cliente público para validar token de usuario. */
const getPublicAuthClient = () => {
  const env = import.meta.env ?? {};
  const url =
    process.env.PUBLIC_SUPABASE_URL ??
    env.PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    env.SUPABASE_URL;
  const anonKey =
    process.env.PUBLIC_SUPABASE_ANON_KEY ??
    env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

/** @type {import("astro").APIRoute} */
export const GET = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "my-sales-products",
      windowMs: 60_000,
      max: 60,
    });
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }), {
        status: 429,
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      const config = getSupabaseAdminConfigStatus();
      return new Response(
        JSON.stringify({
          error: `Servicio no disponible. Falta configurar ${config.missing.join(", ")} en Vercel.`,
        }),
        { status: 503 },
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado." }), {
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const authClient = getPublicAuthClient();
    if (!authClient) {
      return new Response(
        JSON.stringify({
          error: "Servicio no disponible. Falta configurar PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_ANON_KEY.",
        }),
        { status: 503 },
      );
    }

    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Sesion invalida o expirada." }), { status: 401 });
    }

    const sellerId = userData.user.id;
    const { data: ownProducts, error: ownProductsError } = await supabaseAdmin
      .from("products")
      .select("id, title, currency, image_url")
      .eq("user_id", sellerId);

    if (ownProductsError) {
      console.error("[my-sales-products] products query failed", ownProductsError.message);
      return new Response(
        JSON.stringify({ error: "No se pudieron cargar los productos." }),
        { status: 500 },
      );
    }

    if (!Array.isArray(ownProducts) || ownProducts.length === 0) {
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }

    const productMap = new Map(
      ownProducts.map((product) => [String(product.id), product]),
    );
    const productIds = [...productMap.keys()];

    const { data: salesRows, error: salesError } = await supabaseAdmin
      .from("order_items")
      .select(
        "product_id, name, qty, unit_price, orders!inner(id, user_id, created_at, status, payment_detail, shipping_full_name)",
      )
      .in("product_id", productIds);

    if (salesError) {
      console.error("[my-sales-products] sales query failed", salesError.message);
      return new Response(
        JSON.stringify({ error: "No se pudieron cargar las ventas." }),
        { status: 500 },
      );
    }

    const soldMap = new Map();
    const soldPairs = [];
    (salesRows ?? []).forEach((row) => {
      const productId = String(row?.product_id ?? "").trim();
      if (!productId) return;
      const product = productMap.get(productId);
      if (!product) return;

      const order = row?.orders ?? null;
      const orderStatus = String(order?.status ?? "")
        .trim()
        .toLowerCase();
      if (!allowedOrderStatuses.has(orderStatus)) return;

      const qty = toPositiveNumber(row?.qty, 1) || 1;
      const unitPrice = toPositiveNumber(row?.unit_price, 0);
      const orderCreatedAt = order?.created_at ?? null;
      const buyerNote = extractBuyerNote(order?.payment_detail);
      const buyerName = String(order?.shipping_full_name ?? "").trim();
      const buyerUserId = String(order?.user_id ?? "").trim();

      const entry = soldMap.get(productId) ?? {
        productId,
        title: String(product.title ?? row?.name ?? "Producto"),
        currency: String(product.currency ?? "ARS"),
        image: String(product.image_url ?? "").trim() || "/logo2.svg",
        quantity: 0,
        revenue: 0,
        ordersSet: new Set(),
        lastSoldAt: null,
        lastOrderId: "",
        lastBuyerNote: "",
        lastBuyerName: "",
        lastBuyerUserId: "",
        salesHistory: [],
      };

      entry.quantity += qty;
      entry.revenue += unitPrice * qty;
      if (order?.id) entry.ordersSet.add(String(order.id));
      entry.salesHistory.push({
        orderId: String(order?.id ?? "").trim(),
        productId,
        soldAt: orderCreatedAt,
        qty,
        subtotal: unitPrice * qty,
        buyerName,
        buyerUserId,
        buyerNote,
        dispatchedAt: null,
      });
      if (order?.id && productId) {
        soldPairs.push({ orderId: String(order.id).trim(), productId });
      }

      if (orderCreatedAt) {
        const date = new Date(orderCreatedAt);
        if (!Number.isNaN(date.getTime())) {
          if (!entry.lastSoldAt || date > entry.lastSoldAt) {
            entry.lastSoldAt = date;
            entry.lastOrderId = String(order?.id ?? "").trim();
            entry.lastBuyerNote = buyerNote;
            entry.lastBuyerName = buyerName;
            entry.lastBuyerUserId = buyerUserId;
          }
        }
      }

      soldMap.set(productId, entry);
    });

    const orderIds = [...new Set(soldPairs.map((pair) => pair.orderId).filter(Boolean))];
    const productIdsBySales = [...new Set(soldPairs.map((pair) => pair.productId).filter(Boolean))];
    const dispatchMap = new Map();
    if (orderIds.length > 0 && productIdsBySales.length > 0) {
      const { data: dispatchRows, error: dispatchError } = await supabaseAdmin
        .from("sale_dispatches")
        .select("order_id, product_id, dispatched_at")
        .eq("seller_id", sellerId)
        .in("order_id", orderIds)
        .in("product_id", productIdsBySales);

      if (!dispatchError && Array.isArray(dispatchRows)) {
        dispatchRows.forEach((row) => {
          const orderId = String(row?.order_id ?? "").trim();
          const productId = String(row?.product_id ?? "").trim();
          const dispatchedAt = String(row?.dispatched_at ?? "").trim();
          if (!orderId || !productId || !dispatchedAt) return;
          dispatchMap.set(`${orderId}::${productId}`, dispatchedAt);
        });
      }
    }

    const items = Array.from(soldMap.values())
      .map((entry) => ({
        productId: entry.productId,
        title: entry.title,
        currency: entry.currency,
        image: entry.image,
        quantity: entry.quantity,
        revenue: entry.revenue,
        ordersCount: entry.ordersSet.size,
        lastSoldAt: entry.lastSoldAt ? entry.lastSoldAt.toISOString() : null,
        lastOrderId: entry.lastOrderId || "",
        lastBuyerNote: entry.lastBuyerNote || "",
        lastBuyerName: entry.lastBuyerName || "",
        lastBuyerUserId: entry.lastBuyerUserId || "",
        salesHistory: entry.salesHistory
          .filter((sale) => sale.orderId && sale.soldAt)
          .map((sale) => {
            const dispatchedAt = dispatchMap.get(`${sale.orderId}::${sale.productId}`) ?? null;
            return {
              orderId: sale.orderId,
              productId: sale.productId,
              soldAt: sale.soldAt,
              qty: sale.qty,
              subtotal: sale.subtotal,
              buyerName: sale.buyerName,
              buyerUserId: sale.buyerUserId,
              buyerNote: sale.buyerNote,
              dispatchedAt,
            };
          })
          .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime()),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return new Response(JSON.stringify({ items }), { status: 200 });
  } catch (error) {
    console.error("[my-sales-products] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudieron cargar las ventas." }), {
      status: 500,
    });
  }
};
