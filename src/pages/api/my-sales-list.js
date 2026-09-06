/* API paginada de ventas para el panel del vendedor. */
import { jsonResponse } from "../../lib/apiResponse.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin, getSupabaseAdminConfigStatus } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";

const PAGE_SIZE = 3;
const SHIPPING_FEE = 5000;
const completedStatuses = new Set(["completed", "shipped", "ready_for_pickup"]);

const toNonNegativeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));

const normalizeProviderName = (value) =>
  String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const getSellerDestination = (shippingAddress, shippingCity, providerName) => {
  const parts = String(shippingAddress ?? "").split("|").map((part) => {
    const [provider, ...address] = part.split(":");
    return { provider: normalizeProviderName(provider), address: address.join(":").trim() };
  }).filter((entry) => entry.provider);
  if (parts.length === 0) return { address: String(shippingAddress ?? "").trim(), city: String(shippingCity ?? "").trim() };
  const match = parts.find((entry) => entry.provider === normalizeProviderName(providerName));
  return { address: match?.address ?? "", city: "" };
};

const getSellerShippingCost = (shippingRequested, orderCost, shippingAddress, providerName) => {
  if (!shippingRequested) return 0;
  const cost = toNonNegativeNumber(orderCost);
  const providers = String(shippingAddress ?? "").split("|").map((part) => normalizeProviderName(part.split(":")[0])).filter(Boolean);
  if (providers.length > 0 && !providers.includes(normalizeProviderName(providerName))) return 0;
  return Math.min(cost, SHIPPING_FEE);
};

const getBuyerNote = (value) => {
  const detail = String(value ?? "");
  const marker = "note:";
  const index = detail.indexOf(marker);
  return index >= 0 ? detail.slice(index + marker.length).trim() : "";
};

/** @type {import("astro").APIRoute} */
export const GET = async ({ request, url }) => {
  try {
    const rate = checkRateLimit({ request, routeKey: "my-sales-list", windowMs: 60_000, max: 60 });
    if (!rate.allowed) return jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429);

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      const config = getSupabaseAdminConfigStatus();
      return jsonResponse({ error: `Servicio no disponible. Falta configurar ${config.missing.join(", ")} en Vercel.` }, 503);
    }

    const auth = await getAuthenticatedUser(supabaseAdmin, request);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && from > to)) {
      return jsonResponse({ error: "El rango de fechas no es válido." }, 400);
    }
    const requestedPage = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pendingOnly = url.searchParams.get("pending") === "1";

    const { data: ownProducts, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, title, currency, image_url, seller_name")
      .eq("user_id", auth.user.id);
    if (productsError) throw productsError;
    if (!Array.isArray(ownProducts) || ownProducts.length === 0) {
      return jsonResponse({ items: [], pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 } });
    }

    const products = new Map(ownProducts.map((product) => [String(product.id), product]));
    let salesQuery = supabaseAdmin
      .from("order_items")
      .select("product_id, name, unit_price, provider, orders!inner(id, user_id, created_at, status, payment_detail, shipping_full_name, shipping_address, shipping_city, shipping_phone, shipping_requested, shipping_cost)")
      .in("product_id", [...products.keys()])
      .eq("orders.status", "approved")
      .order("created_at", { referencedTable: "orders", ascending: false });
    if (from) salesQuery = salesQuery.gte("orders.created_at", `${from}T00:00:00.000Z`);
    if (to) salesQuery = salesQuery.lte("orders.created_at", `${to}T23:59:59.999Z`);

    const { data: rows, error: salesError } = await salesQuery;
    if (salesError) throw salesError;
    const pairs = (rows ?? []).map((row) => ({ orderId: String(row?.orders?.id ?? "").trim(), productId: String(row?.product_id ?? "").trim() })).filter((pair) => pair.orderId && pair.productId);
    const dispatchMap = new Map();
    if (pairs.length > 0) {
      const { data: dispatches, error: dispatchError } = await supabaseAdmin
        .from("sale_dispatches")
        .select("order_id, product_id, fulfillment_status, dispatched_at")
        .eq("seller_id", auth.user.id)
        .in("order_id", [...new Set(pairs.map((pair) => pair.orderId))]);
      if (dispatchError) throw dispatchError;
      (dispatches ?? []).forEach((dispatch) => {
        dispatchMap.set(`${dispatch.order_id}::${dispatch.product_id}`, dispatch);
      });
    }

    const allSales = (rows ?? []).map((row) => {
      const productId = String(row?.product_id ?? "").trim();
      const product = products.get(productId);
      const order = row?.orders ?? {};
      if (!product || !order?.id) return null;
      const providerName = String(row?.provider ?? product.seller_name ?? "").trim();
      const orderShippingRequested = Boolean(order.shipping_requested);
      const shippingCost = getSellerShippingCost(orderShippingRequested, order.shipping_cost, order.shipping_address, providerName);
      const shippingRequested = orderShippingRequested && shippingCost > 0;
      const destination = getSellerDestination(order.shipping_address, order.shipping_city, providerName);
      const dispatch = dispatchMap.get(`${order.id}::${productId}`);
      const fulfillmentStatus = String(dispatch?.fulfillment_status ?? (shippingRequested ? "requested" : "pickup_pending")).trim();
      return {
        productId,
        title: String(product.title ?? row.name ?? "Producto"),
        currency: String(product.currency ?? "ARS"),
        image: String(product.image_url ?? "").trim() || "/logo2.svg",
        salesHistory: [{
          orderId: String(order.id), productId, soldAt: order.created_at, qty: 1,
          subtotal: toNonNegativeNumber(row.unit_price), buyerName: String(order.shipping_full_name ?? "").trim(),
          buyerUserId: String(order.user_id ?? "").trim(), buyerNote: getBuyerNote(order.payment_detail),
          shippingRequested, shippingAddress: destination.address, shippingCity: destination.city,
          shippingPhone: String(order.shipping_phone ?? "").trim(), shippingCost,
          fulfillmentStatus, dispatchedAt: dispatch?.dispatched_at ?? null,
        }],
        pending: !completedStatuses.has(fulfillmentStatus),
      };
    }).filter(Boolean).filter((sale) => !pendingOnly || sale.pending);

    const total = allSales.length;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
    const first = (page - 1) * PAGE_SIZE;
    return jsonResponse({
      items: allSales.slice(first, first + PAGE_SIZE).map(({ pending, ...sale }) => sale),
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages },
    });
  } catch (error) {
    console.error("[my-sales-list] query failed", error?.message ?? error);
    return jsonResponse({ error: "No se pudieron cargar las ventas." }, 500);
  }
};
