/* API paginada de ventas para el panel del vendedor. */
import { jsonResponse } from "../../lib/apiResponse.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin, getSupabaseAdminConfigStatus } from "../../lib/supabaseServer.js";
import { SALES_HISTORY_ORDER_STATUSES, isSaleDispatchable, normalizePaymentStatus } from "../../lib/paymentStatus.js";
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

const getVisibleOrderStatuses = () => [...SALES_HISTORY_ORDER_STATUSES].filter((item) => item !== "canceled");

const buildPagination = ({ requestedPage, total }) => {
  const safeTotal = Math.max(0, Number(total) || 0);
  const totalPages = Math.ceil(safeTotal / PAGE_SIZE);
  const page = totalPages === 0 ? 1 : Math.min(Math.max(1, requestedPage), totalPages);
  return { page, pageSize: PAGE_SIZE, total: safeTotal, totalPages };
};

const removeInternalPendingFlag = (sales = []) => sales.map(({ pending, ...sale }) => sale);

const isMissingSellerSalesRpc = (error) => {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "");
  return (
    code === "PGRST202" ||
    code === "42883" ||
    (
      message.includes("get_seller_sales_page") &&
      (message.includes("schema cache") || message.includes("does not exist") || message.includes("Could not find"))
    )
  );
};

const toSaleItem = ({ productId, product, order, row, dispatch }) => {
  if (!productId || !order?.id) return null;

  const providerName = String(row?.provider ?? product?.seller_name ?? "").trim();
  const orderStatus = normalizePaymentStatus(order.status);
  const dispatchable = isSaleDispatchable(orderStatus);
  const orderShippingRequested = Boolean(order.shipping_requested);
  const shippingCost = getSellerShippingCost(
    orderShippingRequested,
    order.shipping_cost,
    order.shipping_address,
    providerName,
  );
  const shippingRequested = orderShippingRequested && shippingCost > 0;
  const destination = getSellerDestination(order.shipping_address, order.shipping_city, providerName);
  const fulfillmentStatus = String(
    dispatch?.fulfillment_status ?? (shippingRequested ? "requested" : "pickup_pending"),
  ).trim();

  return {
    productId,
    title: String(product?.title ?? row?.name ?? "Producto"),
    currency: String(product?.currency ?? "ARS"),
    image: String(product?.image_url ?? "").trim() || "/logo2.svg",
    salesHistory: [{
      orderId: String(order.id),
      productId,
      soldAt: order.created_at,
      qty: 1,
      subtotal: toNonNegativeNumber(row?.unit_price),
      buyerName: String(order.shipping_full_name ?? "").trim(),
      buyerUserId: String(order.user_id ?? "").trim(),
      buyerNote: getBuyerNote(order.payment_detail),
      shippingRequested,
      shippingAddress: destination.address,
      shippingCity: destination.city,
      shippingPhone: String(order.shipping_phone ?? "").trim(),
      shippingCost,
      orderStatus,
      paymentStatus: String(order.payment_status ?? "").trim(),
      paymentId: String(order.payment_id ?? "").trim(),
      paymentDetail: String(order.payment_detail ?? "").trim(),
      fulfillmentStatus,
      dispatchedAt: dispatch?.dispatched_at ?? null,
    }],
    pending: dispatchable && !completedStatuses.has(fulfillmentStatus),
  };
};

const getSellerSalesViaRpc = async (supabaseAdmin, { sellerId, from, to, pendingOnly, requestedPage }) => {
  const runRpc = async (page) => {
    const offset = (page - 1) * PAGE_SIZE;
    return supabaseAdmin.rpc("get_seller_sales_page", {
      p_seller_id: sellerId,
      p_statuses: getVisibleOrderStatuses(),
      p_from: from ? `${from}T00:00:00.000Z` : null,
      p_to: to ? `${to}T23:59:59.999Z` : null,
      p_pending_only: pendingOnly,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
  };

  let page = requestedPage;
  let { data, error } = await runRpc(page);

  if (error) {
    if (isMissingSellerSalesRpc(error)) return null;
    throw error;
  }

  if ((!Array.isArray(data) || data.length === 0) && requestedPage > 1) {
    const firstPage = await runRpc(1);
    if (firstPage.error) throw firstPage.error;
    const firstPageRows = Array.isArray(firstPage.data) ? firstPage.data : [];
    const total = toNonNegativeNumber(firstPageRows[0]?.total_count);
    const totalPages = Math.ceil(total / PAGE_SIZE);
    page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);

    if (page > 1) {
      const retry = await runRpc(page);
      if (retry.error) throw retry.error;
      data = retry.data;
    } else {
      data = firstPageRows;
    }
  }

  const rows = Array.isArray(data) ? data : [];
  const total = toNonNegativeNumber(rows[0]?.total_count);
  const items = rows
    .map((row) => {
      const productId = String(row?.product_id ?? "").trim();
      return toSaleItem({
        productId,
        row: {
          name: row?.item_name,
          unit_price: row?.unit_price,
          provider: row?.provider,
        },
        product: {
          title: row?.product_title,
          currency: row?.product_currency,
          image_url: row?.product_image_url,
          seller_name: row?.product_seller_name,
        },
        order: {
          id: row?.order_id,
          user_id: row?.buyer_user_id,
          created_at: row?.order_created_at,
          status: row?.order_status,
          payment_status: row?.payment_status,
          payment_id: row?.payment_id,
          payment_detail: row?.payment_detail,
          shipping_full_name: row?.shipping_full_name,
          shipping_address: row?.shipping_address,
          shipping_city: row?.shipping_city,
          shipping_phone: row?.shipping_phone,
          shipping_requested: row?.shipping_requested,
          shipping_cost: row?.shipping_cost,
        },
        dispatch: {
          fulfillment_status: row?.fulfillment_status,
          dispatched_at: row?.dispatched_at,
        },
      });
    })
    .filter(Boolean);

  return {
    items: removeInternalPendingFlag(items),
    pagination: buildPagination({ requestedPage: page, total }),
  };
};

const getSellerSalesViaQueries = async (supabaseAdmin, { sellerId, from, to, pendingOnly, requestedPage }) => {
  const { data: ownProducts, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, title, currency, image_url, seller_name")
    .eq("user_id", sellerId);
  if (productsError) throw productsError;
  if (!Array.isArray(ownProducts) || ownProducts.length === 0) {
    return { items: [], pagination: buildPagination({ requestedPage: 1, total: 0 }) };
  }

  const products = new Map(ownProducts.map((product) => [String(product.id), product]));
  let salesQuery = supabaseAdmin
    .from("order_items")
    .select("product_id, name, unit_price, provider, orders!inner(id, user_id, created_at, status, payment_status, payment_id, payment_detail, shipping_full_name, shipping_address, shipping_city, shipping_phone, shipping_requested, shipping_cost)")
    .in("product_id", [...products.keys()])
    .in("orders.status", getVisibleOrderStatuses())
    .order("created_at", { referencedTable: "orders", ascending: false });
  if (from) salesQuery = salesQuery.gte("orders.created_at", `${from}T00:00:00.000Z`);
  if (to) salesQuery = salesQuery.lte("orders.created_at", `${to}T23:59:59.999Z`);

  const { data: rows, error: salesError } = await salesQuery;
  if (salesError) throw salesError;
  const pairs = (rows ?? []).map((row) => ({
    orderId: String(row?.orders?.id ?? "").trim(),
    productId: String(row?.product_id ?? "").trim(),
  })).filter((pair) => pair.orderId && pair.productId);
  const dispatchMap = new Map();
  if (pairs.length > 0) {
    const { data: dispatches, error: dispatchError } = await supabaseAdmin
      .from("sale_dispatches")
      .select("order_id, product_id, fulfillment_status, dispatched_at")
      .eq("seller_id", sellerId)
      .in("order_id", [...new Set(pairs.map((pair) => pair.orderId))]);
    if (dispatchError) throw dispatchError;
    (dispatches ?? []).forEach((dispatch) => {
      dispatchMap.set(`${dispatch.order_id}::${dispatch.product_id}`, dispatch);
    });
  }

  const allSales = (rows ?? [])
    .map((row) => {
      const productId = String(row?.product_id ?? "").trim();
      const product = products.get(productId);
      if (!product) return null;
      return toSaleItem({
        productId,
        product,
        row,
        order: row?.orders ?? {},
        dispatch: dispatchMap.get(`${row?.orders?.id}::${productId}`),
      });
    })
    .filter(Boolean)
    .filter((sale) => !pendingOnly || sale.pending);

  const pagination = buildPagination({ requestedPage, total: allSales.length });
  const first = (pagination.page - 1) * PAGE_SIZE;
  return {
    items: removeInternalPendingFlag(allSales.slice(first, first + PAGE_SIZE)),
    pagination,
  };
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

    const params = {
      sellerId: auth.user.id,
      from,
      to,
      pendingOnly,
      requestedPage,
    };
    const rpcResult = await getSellerSalesViaRpc(supabaseAdmin, params);
    if (rpcResult) return jsonResponse(rpcResult);

    return jsonResponse(await getSellerSalesViaQueries(supabaseAdmin, params));
  } catch (error) {
    console.error("[my-sales-list] query failed", error?.message ?? error);
    return jsonResponse({ error: "No se pudieron cargar las ventas." }, 500);
  }
};
