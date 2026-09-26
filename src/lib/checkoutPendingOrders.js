const DEFAULT_PENDING_ORDER_TTL_MINUTES = 24 * 60;

const getPendingOrderTtlMinutes = () => {
  const raw = Number(process.env.CHECKOUT_PENDING_ORDER_TTL_MINUTES ?? DEFAULT_PENDING_ORDER_TTL_MINUTES);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_PENDING_ORDER_TTL_MINUTES;
  return raw;
};

export const cancelAbandonedCheckoutOrders = async (supabaseAdmin, { userId, olderThanMinutes } = {}) => {
  const safeUserId = String(userId ?? "").trim();
  if (!supabaseAdmin || !safeUserId) return { ok: false, count: 0 };

  const ttlMinutes = Number.isFinite(Number(olderThanMinutes)) && Number(olderThanMinutes) > 0
    ? Number(olderThanMinutes)
    : getPendingOrderTtlMinutes();
  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("orders")
    .update({
      status: "cancelled",
      payment_status: "cancelled",
      payment_detail: "checkout_abandoned",
    })
    .eq("user_id", safeUserId)
    .eq("status", "pending")
    .is("payment_id", null)
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    return { ok: false, count: 0, error: error.message };
  }

  return { ok: true, count: Array.isArray(data) ? data.length : 0 };
};

export const cancelAbandonedCheckoutOrdersForProducts = async (
  supabaseAdmin,
  { productIds = [], olderThanMinutes } = {},
) => {
  const ids = [
    ...new Set(
      (Array.isArray(productIds) ? productIds : [])
        .map((productId) => String(productId ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (!supabaseAdmin || ids.length === 0) return { ok: true, count: 0 };

  const ttlMinutes = Number.isFinite(Number(olderThanMinutes)) && Number(olderThanMinutes) > 0
    ? Number(olderThanMinutes)
    : getPendingOrderTtlMinutes();
  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();

  const { data: pendingRows, error: lookupError } = await supabaseAdmin
    .from("order_items")
    .select("order_id, orders!inner(status, payment_id, created_at)")
    .in("product_id", ids)
    .eq("orders.status", "pending")
    .is("orders.payment_id", null)
    .lt("orders.created_at", cutoff);

  if (lookupError) {
    return { ok: false, count: 0, error: lookupError.message };
  }

  const orderIds = [
    ...new Set(
      (pendingRows ?? [])
        .map((row) => String(row?.order_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (orderIds.length === 0) return { ok: true, count: 0 };

  const { data, error } = await supabaseAdmin
    .from("orders")
    .update({
      status: "cancelled",
      payment_status: "cancelled",
      payment_detail: "checkout_abandoned",
    })
    .in("id", orderIds)
    .eq("status", "pending")
    .is("payment_id", null)
    .select("id");

  if (error) {
    return { ok: false, count: 0, error: error.message };
  }

  return { ok: true, count: Array.isArray(data) ? data.length : 0 };
};
