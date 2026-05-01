import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";

const ALLOWED_ORDER_STATUSES = new Set(["approved", "pending"]);
const DAYS_WINDOW = 7;
const MAX_ITEMS = 10;

const toSafeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

export const GET = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "featured-products",
      windowMs: 60_000,
      max: 120,
    });
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Demasiadas solicitudes." }), { status: 429 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ error: "Servicio no disponible." }), { status: 503 });
    }

    const fromDate = new Date(Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("order_items")
      .select("product_id, qty, unit_price, orders!inner(created_at, status)")
      .gte("created_at", fromDate);

    if (rowsError) {
      return new Response(JSON.stringify({ error: "No se pudieron cargar destacados." }), { status: 500 });
    }

    const aggregate = new Map();
    (rows ?? []).forEach((row) => {
      const productId = String(row?.product_id ?? "").trim();
      if (!productId) return;
      const orderStatus = String(row?.orders?.status ?? "").trim().toLowerCase();
      if (!ALLOWED_ORDER_STATUSES.has(orderStatus)) return;
      const qty = Math.max(1, toSafeNumber(row?.qty, 1));
      const unitPrice = Math.max(0, toSafeNumber(row?.unit_price, 0));
      const current = aggregate.get(productId) ?? { soldQty: 0, revenue: 0 };
      current.soldQty += qty;
      current.revenue += unitPrice * qty;
      aggregate.set(productId, current);
    });

    const productIds = [...aggregate.keys()];
    if (productIds.length === 0) {
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }

    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, title, price, currency, image_url, seller_name, user_id")
      .in("id", productIds);

    if (productsError) {
      return new Response(JSON.stringify({ error: "No se pudieron cargar destacados." }), { status: 500 });
    }

    const items = (products ?? [])
      .map((product) => {
        const productId = String(product?.id ?? "").trim();
        const metrics = aggregate.get(productId);
        if (!metrics) return null;
        return {
          productId,
          title: String(product?.title ?? "Producto"),
          price: toSafeNumber(product?.price, 0),
          currency: String(product?.currency ?? "ARS"),
          imageUrl: String(product?.image_url ?? "").trim() || "/logo2.svg",
          sellerName: String(product?.seller_name ?? "Proveedor"),
          sellerUserId: String(product?.user_id ?? "").trim(),
          soldQty: metrics.soldQty,
          revenue: metrics.revenue,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.soldQty !== a.soldQty) return b.soldQty - a.soldQty;
        return b.revenue - a.revenue;
      })
      .slice(0, MAX_ITEMS);

    return new Response(JSON.stringify({ items }), { status: 200 });
  } catch (error) {
    console.error("[featured-products] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudieron cargar destacados." }), { status: 500 });
  }
};
