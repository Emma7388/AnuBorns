/* API comprador: lee estados por producto y marca notificaciones como vistas. */
import { jsonResponse } from "../../lib/apiResponse.js";
import { getUniqueStringIds } from "../../lib/orderInput.js";
import { readJsonBody } from "../../lib/serverRequest.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";

const DEFAULT_STATUS_UPDATED_AT = "1970-01-01T00:00:00.000Z";
const POST_BODY_MAX_BYTES = 48_000;

const VALID_FULFILLMENT_STATUSES = new Set([
  "pending",
  "requested",
  "preparing",
  "shipped",
  "delivered",
  "pickup_pending",
  "ready_for_pickup",
  "picked_up",
  "completed",
]);

const parseCsv = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const uniqueTrimmedStrings = (values = []) =>
  [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean))];

const normalizeStatusUpdatedAt = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return DEFAULT_STATUS_UPDATED_AT;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return DEFAULT_STATUS_UPDATED_AT;
  return date.toISOString();
};

const pairKey = (orderId, productId) =>
  `${String(orderId ?? "").trim()}::${String(productId ?? "").trim()}`;

const fallbackFulfillmentStatus = (order) => {
  const status = String(order?.shipping_status ?? "").trim();
  return status || (order?.shipping_requested ? "requested" : "pickup_pending");
};

const getRouteContext = async ({ request, routeKey, max }) => {
  const rate = checkRateLimit({
    request,
    routeKey,
    windowMs: 60_000,
    max,
  });
  if (!rate.allowed) {
    return {
      response: jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429),
    };
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return {
      response: jsonResponse({ error: "Servicio no disponible." }, 503),
    };
  }

  const auth = await getAuthenticatedUser(supabaseAdmin, request);
  if (!auth.ok) {
    return {
      response: jsonResponse({ error: auth.error }, auth.status),
    };
  }

  return { supabaseAdmin, user: auth.user };
};

const fetchOwnedOrders = async ({ supabaseAdmin, buyerId, orderIds }) => {
  const safeOrderIds = uniqueTrimmedStrings(orderIds);
  if (safeOrderIds.length === 0) {
    return { orders: [], ownedOrderIds: [] };
  }

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, shipping_status, shipping_requested")
    .eq("user_id", buyerId)
    .in("id", safeOrderIds);

  if (error) {
    return { error: "No se pudieron validar las compras." };
  }

  const orders = Array.isArray(data) ? data : [];
  const ownedOrderIds = uniqueTrimmedStrings(orders.map((order) => order?.id));
  return { orders, ownedOrderIds };
};

const fetchOrderItems = async ({ supabaseAdmin, orderIds, productIds = [] }) => {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { orderItems: [] };
  }

  let query = supabaseAdmin
    .from("order_items")
    .select("order_id, product_id")
    .in("order_id", orderIds);

  if (productIds.length > 0) {
    query = query.in("product_id", productIds);
  }

  const { data, error } = await query;
  if (error) {
    return { error: "No se pudieron validar los productos." };
  }

  return { orderItems: Array.isArray(data) ? data : [] };
};

const fetchDispatchRows = async ({ supabaseAdmin, orderIds, productIds }) => {
  if (!Array.isArray(orderIds) || orderIds.length === 0 || !Array.isArray(productIds) || productIds.length === 0) {
    return { dispatchRows: [] };
  }

  const { data, error } = await supabaseAdmin
    .from("sale_dispatches")
    .select("order_id, product_id, fulfillment_status, status_updated_at")
    .in("order_id", orderIds)
    .in("product_id", productIds);

  if (error) {
    return { error: "No se pudieron cargar los estados de retiro." };
  }

  return { dispatchRows: Array.isArray(data) ? data : [] };
};

const buildFallbackStatusByOrder = (orders) =>
  new Map((orders ?? []).map((order) => [String(order?.id ?? "").trim(), fallbackFulfillmentStatus(order)]));

const buildDispatchMap = (dispatchRows) =>
  new Map((dispatchRows ?? []).map((row) => [pairKey(row?.order_id, row?.product_id), row]));

const fetchReadSet = async ({ supabaseAdmin, buyerId, orderIds }) => {
  const { data, error } = await supabaseAdmin
    .from("purchase_status_reads")
    .select("order_id, product_id, fulfillment_status, status_updated_at")
    .eq("user_id", buyerId)
    .in("order_id", orderIds);

  if (error) {
    return { error: "No se pudieron cargar estados leidos." };
  }

  const rows = Array.isArray(data) ? data : [];
  const readSet = new Set(
    rows.map((row) =>
      [
        String(row?.order_id ?? "").trim(),
        String(row?.product_id ?? "").trim(),
        String(row?.fulfillment_status ?? "").trim(),
        normalizeStatusUpdatedAt(row?.status_updated_at),
      ].join("::")
    ),
  );

  return { readSet, hasAnyRead: readSet.size > 0 };
};

const readFulfillmentItems = async ({ supabaseAdmin, user, orderIds }) => {
  const buyerId = user.id;
  const owned = await fetchOwnedOrders({ supabaseAdmin, buyerId, orderIds });
  if (owned.error) return { status: 500, payload: { error: owned.error } };
  if (owned.ownedOrderIds.length === 0) return { status: 200, payload: { items: [] } };

  const itemResult = await fetchOrderItems({ supabaseAdmin, orderIds: owned.ownedOrderIds });
  if (itemResult.error) return { status: 500, payload: { error: itemResult.error } };

  const productIds = getUniqueStringIds(itemResult.orderItems.map((item) => item?.product_id));
  if (productIds.length === 0) return { status: 200, payload: { items: [] } };

  const dispatchResult = await fetchDispatchRows({
    supabaseAdmin,
    orderIds: owned.ownedOrderIds,
    productIds,
  });
  if (dispatchResult.error) return { status: 500, payload: { error: dispatchResult.error } };

  const readResult = await fetchReadSet({ supabaseAdmin, buyerId, orderIds: owned.ownedOrderIds });
  if (readResult.error) return { status: 500, payload: { error: readResult.error } };

  const dispatchByPair = buildDispatchMap(dispatchResult.dispatchRows);
  const fallbackByOrder = buildFallbackStatusByOrder(owned.orders);

  const items = itemResult.orderItems.map((item) => {
    const orderId = String(item?.order_id ?? "").trim();
    const productId = String(item?.product_id ?? "").trim();
    const dispatch = dispatchByPair.get(pairKey(orderId, productId));
    const fulfillmentStatus =
      String(dispatch?.fulfillment_status ?? fallbackByOrder.get(orderId) ?? "pickup_pending").trim() ||
      "pickup_pending";
    const statusUpdatedAt = normalizeStatusUpdatedAt(dispatch?.status_updated_at);

    return {
      orderId,
      productId,
      fulfillmentStatus,
      statusUpdatedAt,
      statusRead: readResult.readSet.has(`${orderId}::${productId}::${fulfillmentStatus}::${statusUpdatedAt}`),
    };
  });

  return { status: 200, payload: { items, hasAnyRead: readResult.hasAnyRead } };
};

const normalizeReadItems = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      orderId: String(item?.orderId ?? "").trim(),
      productId: String(item?.productId ?? "").trim(),
      fulfillmentStatus: String(item?.fulfillmentStatus ?? "").trim(),
      statusUpdatedAt: normalizeStatusUpdatedAt(item?.statusUpdatedAt),
    }))
    .filter((item) =>
      item.orderId &&
      item.productId &&
      VALID_FULFILLMENT_STATUSES.has(item.fulfillmentStatus)
    );

const buildCurrentStateByPair = ({ orders, orderItems, dispatchRows }) => {
  const fallbackByOrder = buildFallbackStatusByOrder(orders);
  const currentStateByPair = new Map(
    (orderItems ?? []).map((item) => {
      const orderId = String(item?.order_id ?? "").trim();
      const productId = String(item?.product_id ?? "").trim();
      return [
        pairKey(orderId, productId),
        {
          fulfillmentStatus: fallbackByOrder.get(orderId) || "pickup_pending",
          statusUpdatedAt: DEFAULT_STATUS_UPDATED_AT,
        },
      ];
    }),
  );

  (dispatchRows ?? []).forEach((row) => {
    const orderId = String(row?.order_id ?? "").trim();
    const productId = String(row?.product_id ?? "").trim();
    const status = String(row?.fulfillment_status ?? "").trim();
    if (!orderId || !productId || !status) return;

    currentStateByPair.set(pairKey(orderId, productId), {
      fulfillmentStatus: status,
      statusUpdatedAt: normalizeStatusUpdatedAt(row?.status_updated_at),
    });
  });

  return currentStateByPair;
};

const markFulfillmentItemsRead = async ({ supabaseAdmin, user, reads }) => {
  const safeReads = normalizeReadItems(reads);
  if (safeReads.length === 0) {
    return { status: 200, payload: { ok: true, inserted: 0 } };
  }

  const buyerId = user.id;
  const orderIds = uniqueTrimmedStrings(safeReads.map((item) => item.orderId));
  const productIds = getUniqueStringIds(safeReads.map((item) => item.productId));

  const owned = await fetchOwnedOrders({ supabaseAdmin, buyerId, orderIds });
  if (owned.error) return { status: 500, payload: { error: owned.error } };
  if (owned.ownedOrderIds.length === 0) {
    return { status: 403, payload: { error: "No autorizado para marcar estos estados." } };
  }

  const itemResult = await fetchOrderItems({
    supabaseAdmin,
    orderIds: owned.ownedOrderIds,
    productIds,
  });
  if (itemResult.error) return { status: 500, payload: { error: itemResult.error } };

  const validPairs = new Set(itemResult.orderItems.map((item) => pairKey(item?.order_id, item?.product_id)));
  const dispatchResult = await fetchDispatchRows({
    supabaseAdmin,
    orderIds: owned.ownedOrderIds,
    productIds,
  });
  if (dispatchResult.error) {
    return { status: 500, payload: { error: "No se pudieron validar los estados actuales." } };
  }

  const ownedOrderSet = new Set(owned.ownedOrderIds);
  const currentStateByPair = buildCurrentStateByPair({
    orders: owned.orders,
    orderItems: itemResult.orderItems,
    dispatchRows: dispatchResult.dispatchRows,
  });

  const rows = safeReads
    .filter((item) => ownedOrderSet.has(item.orderId))
    .filter((item) => {
      const key = pairKey(item.orderId, item.productId);
      const currentState = currentStateByPair.get(key);
      return (
        validPairs.has(key) &&
        currentState?.fulfillmentStatus === item.fulfillmentStatus &&
        currentState?.statusUpdatedAt === item.statusUpdatedAt
      );
    })
    .map((item) => ({
      user_id: buyerId,
      order_id: item.orderId,
      product_id: item.productId,
      fulfillment_status: item.fulfillmentStatus,
      status_updated_at: item.statusUpdatedAt,
    }));

  if (rows.length === 0) {
    return { status: 403, payload: { error: "No autorizado para marcar estos productos." } };
  }

  const { error } = await supabaseAdmin
    .from("purchase_status_reads")
    .upsert(rows, {
      onConflict: "user_id,order_id,product_id,fulfillment_status,status_updated_at",
      ignoreDuplicates: true,
    });

  if (error) {
    return { status: 500, payload: { error: "No se pudieron marcar los estados como leidos." } };
  }

  return { status: 200, payload: { ok: true, inserted: rows.length } };
};

/** @type {import("astro").APIRoute} */
export const GET = async ({ request }) => {
  try {
    const context = await getRouteContext({
      request,
      routeKey: "purchase-fulfillment",
      max: 80,
    });
    if (context.response) return context.response;

    const url = new URL(request.url);
    const orderIds = parseCsv(url.searchParams.get("orderIds"));
    const result = await readFulfillmentItems({ ...context, orderIds });
    return jsonResponse(result.payload, result.status);
  } catch (error) {
    console.error("[purchase-fulfillment] Unhandled error", error);
    return jsonResponse({ error: "No se pudieron cargar los estados de retiro." }, 500);
  }
};

/** @type {import("astro").APIRoute} */
export const POST = async ({ request }) => {
  try {
    const context = await getRouteContext({
      request,
      routeKey: "purchase-fulfillment-read",
      max: 120,
    });
    if (context.response) return context.response;

    const body = await readJsonBody(request, { maxBytes: POST_BODY_MAX_BYTES });
    if (!body.ok) return jsonResponse({ error: body.error }, body.status);

    const payload = body.data;
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "El detalle de lecturas no es valido." }, 400);
    }

    const result = Array.isArray(payload?.orderIds)
      ? await readFulfillmentItems({ ...context, orderIds: payload.orderIds })
      : await markFulfillmentItemsRead({ ...context, reads: payload?.items });

    return jsonResponse(result.payload, result.status);
  } catch (error) {
    console.error("[purchase-fulfillment-read] Unhandled error", error);
    return jsonResponse({ error: "No se pudieron procesar los estados de retiro." }, 500);
  }
};
