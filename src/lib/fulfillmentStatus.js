export const normalizeFulfillmentStatus = (value, shippingRequested = false) => {
  const raw = String(value ?? "").trim();
  if (raw) return raw;
  return shippingRequested ? "requested" : "pickup_pending";
};

const AGGREGATE_PRIORITY = {
  pending: 0,
  requested: 0,
  pickup_pending: 0,
  preparing: 1,
  shipped: 2,
  ready_for_pickup: 2,
  delivered: 3,
  picked_up: 3,
  completed: 4,
};

export const getAggregateOrderStatus = (statuses = [], { shippingRequested = false } = {}) => {
  const safeStatuses = (Array.isArray(statuses) ? statuses : [])
    .map((status) => normalizeFulfillmentStatus(status, shippingRequested))
    .filter(Boolean);

  if (safeStatuses.length === 0) return normalizeFulfillmentStatus("", shippingRequested);
  if (safeStatuses.every((status) => status === "completed")) return "completed";

  const activeStatuses = safeStatuses.filter((status) => status !== "completed");
  const candidates = activeStatuses.length > 0 ? activeStatuses : safeStatuses;
  return candidates.reduce((best, status) => {
    const bestPriority = AGGREGATE_PRIORITY[best] ?? 0;
    const statusPriority = AGGREGATE_PRIORITY[status] ?? 0;
    return statusPriority > bestPriority ? status : best;
  }, candidates[0]);
};

export const refreshOrderShippingStatus = async (supabaseAdmin, orderId) => {
  const safeOrderId = String(orderId ?? "").trim();
  if (!supabaseAdmin || !safeOrderId) {
    return { ok: false, error: "Faltan datos para recalcular la entrega." };
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, shipping_requested, shipping_status")
    .eq("id", safeOrderId)
    .maybeSingle();

  if (orderError) return { ok: false, error: "No se pudo cargar la orden." };
  if (!order) return { ok: false, error: "No se encontro la orden." };

  const shippingRequested = Boolean(order.shipping_requested);
  const { data: orderItems, error: orderItemsError } = await supabaseAdmin
    .from("order_items")
    .select("product_id")
    .eq("order_id", safeOrderId);

  if (orderItemsError) return { ok: false, error: "No se pudieron cargar los productos." };

  const productIds = [
    ...new Set((orderItems ?? []).map((item) => String(item?.product_id ?? "").trim()).filter(Boolean)),
  ];

  if (productIds.length === 0) {
    const fallbackStatus = normalizeFulfillmentStatus(order.shipping_status, shippingRequested);
    return { ok: true, status: fallbackStatus };
  }

  const { data: dispatchRows, error: dispatchError } = await supabaseAdmin
    .from("sale_dispatches")
    .select("product_id, fulfillment_status")
    .eq("order_id", safeOrderId)
    .in("product_id", productIds);

  if (dispatchError) return { ok: false, error: "No se pudieron cargar los estados de entrega." };

  const statusByProduct = new Map(
    (dispatchRows ?? []).map((row) => [
      String(row?.product_id ?? "").trim(),
      String(row?.fulfillment_status ?? "").trim(),
    ]),
  );
  const statuses = productIds.map((productId) =>
    normalizeFulfillmentStatus(statusByProduct.get(productId), shippingRequested)
  );
  const nextStatus = getAggregateOrderStatus(statuses, { shippingRequested });

  if (nextStatus && nextStatus !== String(order.shipping_status ?? "").trim()) {
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({ shipping_status: nextStatus })
      .eq("id", safeOrderId);

    if (updateError) return { ok: false, error: "No se pudo actualizar el resumen de entrega." };
  }

  return { ok: true, status: nextStatus };
};
