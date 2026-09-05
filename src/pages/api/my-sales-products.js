/* API: resumen de productos vendidos para el vendedor autenticado. */
import { jsonResponse } from "../../lib/apiResponse.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin, getSupabaseAdminConfigStatus } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";

/* Estados de orden que cuentan como venta operativa para el vendedor. */
const allowedOrderStatuses = new Set(["approved"]);
const SHIPPING_FEE = 5000;

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

const normalizeFulfillmentStatus = (value, shippingRequested) => {
  const raw = String(value ?? "").trim();
  if (raw) return raw;
  return shippingRequested ? "requested" : "pickup_pending";
};

const normalizeProviderName = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const getShippingProviderNames = (shippingAddress) =>
  String(shippingAddress ?? "")
    .split("|")
    .map((part) => part.split(":")[0])
    .map(normalizeProviderName)
    .filter(Boolean);

const getShippingProviderEntries = (shippingAddress) =>
  String(shippingAddress ?? "")
    .split("|")
    .map((part) => {
      const [provider, ...addressParts] = part.split(":");
      return {
        provider: normalizeProviderName(provider),
        address: addressParts.join(":").trim(),
      };
    })
    .filter((entry) => entry.provider);

const getSellerShippingDestination = ({ shippingAddress, shippingCity, providerName }) => {
  const entries = getShippingProviderEntries(shippingAddress);
  if (entries.length > 0) {
    const normalizedProvider = normalizeProviderName(providerName);
    const match = entries.find((entry) => entry.provider === normalizedProvider);
    return {
      address: match?.address ?? "",
      city: "",
    };
  }

  return {
    address: String(shippingAddress ?? "").trim(),
    city: String(shippingCity ?? "").trim(),
  };
};

const getSellerShippingCost = ({ shippingRequested, orderShippingCost, shippingAddress, providerName }) => {
  if (!shippingRequested) return 0;
  const cost = toPositiveNumber(orderShippingCost, 0);
  if (cost <= 0) return 0;

  const requestedProviders = getShippingProviderNames(shippingAddress);
  if (requestedProviders.length > 0) {
    const normalizedProvider = normalizeProviderName(providerName);
    return normalizedProvider && requestedProviders.includes(normalizedProvider)
      ? Math.min(SHIPPING_FEE, cost)
      : 0;
  }

  return cost > SHIPPING_FEE ? SHIPPING_FEE : cost;
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
      return jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      const config = getSupabaseAdminConfigStatus();
      return jsonResponse(
        { error: `Servicio no disponible. Falta configurar ${config.missing.join(", ")} en Vercel.` },
        503,
      );
    }

    const auth = await getAuthenticatedUser(supabaseAdmin, request);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
    const sellerId = auth.user.id;
    const { data: ownProducts, error: ownProductsError } = await supabaseAdmin
      .from("products")
      .select("id, title, currency, image_url, seller_name")
      .eq("user_id", sellerId);

    if (ownProductsError) {
      console.error("[my-sales-products] products query failed", ownProductsError.message);
      return jsonResponse({ error: "No se pudieron cargar los productos." }, 500);
    }

    if (!Array.isArray(ownProducts) || ownProducts.length === 0) {
      return jsonResponse({ items: [] });
    }

    const productMap = new Map(
      ownProducts.map((product) => [String(product.id), product]),
    );
    const productIds = [...productMap.keys()];

    const { data: salesRows, error: salesError } = await supabaseAdmin
      .from("order_items")
      .select(
        "product_id, name, qty, unit_price, provider, orders!inner(id, user_id, created_at, status, payment_detail, shipping_full_name, shipping_address, shipping_city, shipping_phone, shipping_requested, shipping_cost, shipping_status)",
      )
      .in("product_id", productIds);

    if (salesError) {
      console.error("[my-sales-products] sales query failed", salesError.message);
      return jsonResponse({ error: "No se pudieron cargar las ventas." }, 500);
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

      const qty = 1;
      const unitPrice = toPositiveNumber(row?.unit_price, 0);
      const orderCreatedAt = order?.created_at ?? null;
      const buyerNote = extractBuyerNote(order?.payment_detail);
      const buyerName = String(order?.shipping_full_name ?? "").trim();
      const buyerUserId = String(order?.user_id ?? "").trim();
      const orderShippingAddress = String(order?.shipping_address ?? "").trim();
      const orderShippingCity = String(order?.shipping_city ?? "").trim();
      const shippingPhone = String(order?.shipping_phone ?? "").trim();
      const providerName = String(row?.provider ?? product?.seller_name ?? "").trim();
      const orderShippingRequested = Boolean(order?.shipping_requested);
      const shippingCost = getSellerShippingCost({
        shippingRequested: orderShippingRequested,
        orderShippingCost: order?.shipping_cost,
        shippingAddress: orderShippingAddress,
        providerName,
      });
      const shippingRequested = orderShippingRequested && shippingCost > 0;
      const sellerShippingDestination = getSellerShippingDestination({
        shippingAddress: orderShippingAddress,
        shippingCity: orderShippingCity,
        providerName,
      });
      const orderShippingStatus = String(order?.shipping_status ?? "").trim();

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
        shippingRequested,
        shippingAddress: sellerShippingDestination.address,
        shippingCity: sellerShippingDestination.city,
        shippingPhone,
        shippingCost,
        orderShippingStatus,
        fulfillmentStatus: normalizeFulfillmentStatus("", shippingRequested),
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
        .select("order_id, product_id, dispatched_at, fulfillment_status")
        .eq("seller_id", sellerId)
        .in("order_id", orderIds)
        .in("product_id", productIdsBySales);

      if (!dispatchError && Array.isArray(dispatchRows)) {
        dispatchRows.forEach((row) => {
          const orderId = String(row?.order_id ?? "").trim();
          const productId = String(row?.product_id ?? "").trim();
          const dispatchedAt = String(row?.dispatched_at ?? "").trim();
          const fulfillmentStatus = String(row?.fulfillment_status ?? "").trim();
          if (!orderId || !productId) return;
          dispatchMap.set(`${orderId}::${productId}`, {
            dispatchedAt: dispatchedAt || null,
            fulfillmentStatus,
          });
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
            const dispatchState = dispatchMap.get(`${sale.orderId}::${sale.productId}`) ?? {};
            const fulfillmentStatus = normalizeFulfillmentStatus(
              dispatchState.fulfillmentStatus || sale.fulfillmentStatus,
              sale.shippingRequested,
            );
            return {
              orderId: sale.orderId,
              productId: sale.productId,
              soldAt: sale.soldAt,
              qty: sale.qty,
              subtotal: sale.subtotal,
              buyerName: sale.buyerName,
              buyerUserId: sale.buyerUserId,
              buyerNote: sale.buyerNote,
              shippingRequested: sale.shippingRequested,
              shippingAddress: sale.shippingAddress,
              shippingCity: sale.shippingCity,
              shippingPhone: sale.shippingPhone,
              shippingCost: sale.shippingCost,
              orderShippingStatus: sale.orderShippingStatus,
              fulfillmentStatus,
              dispatchedAt: dispatchState.dispatchedAt ?? null,
            };
          })
          .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime()),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return jsonResponse({ items });
  } catch (error) {
    console.error("[my-sales-products] Unhandled error", error);
    return jsonResponse({ error: "No se pudieron cargar las ventas." }, 500);
  }
};
