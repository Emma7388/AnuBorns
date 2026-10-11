const RPC_NAME = "create_checkout_order_atomic";

const toSafeText = (value) => String(value ?? "").trim();

export const isProductReservationConflictError = (error) => {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return message.includes("product_unavailable");
};

const getAtomicItems = (serverItems = []) =>
  (Array.isArray(serverItems) ? serverItems : []).map((item) => ({
    product_id: toSafeText(item?.product_id),
    qty: Math.max(1, Math.min(100, Math.floor(Number(item?.qty ?? 1)) || 1)),
    unit_price: Number(item?.unit_price ?? 0),
    currency: toSafeText(item?.currency).toUpperCase(),
    provider_user_id: toSafeText(item?.provider_user_id),
  }));

const getRpcFailure = (payload = {}) => {
  const code = toSafeText(payload?.code);
  if (code === "product_unavailable") {
    return {
      ok: false,
      status: 409,
      code,
      error: "Uno o más productos no tienen stock suficiente.",
      soldProductIds: Array.isArray(payload?.sold_product_ids)
        ? payload.sold_product_ids.map(toSafeText).filter(Boolean)
        : [],
    };
  }
  if (["products_changed", "products_invalid", "duplicate_products"].includes(code)) {
    return {
      ok: false,
      status: 409,
      code,
      error: "Los productos cambiaron o ya no estan disponibles. Actualiza el carrito.",
      soldProductIds: [],
    };
  }
  return {
    ok: false,
    status: 500,
    code: code || "atomic_checkout_failed",
    error: "No se pudo reservar la compra.",
    soldProductIds: [],
  };
};

export const createAtomicCheckoutOrder = async (
  supabaseAdmin,
  {
    userId,
    status,
    checkout,
    shipping = {},
    shippingStatus,
    paymentStatus = null,
    paymentDetail = null,
  } = {},
) => {
  const items = getAtomicItems(checkout?.serverItems);
  if (!supabaseAdmin || !toSafeText(userId) || items.length === 0) {
    return getRpcFailure({ code: "invalid_request" });
  }

  const { data, error } = await supabaseAdmin.rpc(RPC_NAME, {
    p_user_id: toSafeText(userId),
    p_status: toSafeText(status),
    p_total_amount: Number(checkout?.totalAmount ?? 0),
    p_currency: toSafeText(checkout?.orderCurrency).toUpperCase(),
    p_shipping_full_name: toSafeText(shipping?.fullName),
    p_shipping_address: toSafeText(shipping?.address),
    p_shipping_city: toSafeText(shipping?.city),
    p_shipping_phone: toSafeText(shipping?.phone),
    p_shipping_requested: Boolean(checkout?.shippingRequested),
    p_shipping_cost: Number(checkout?.shippingCost ?? 0),
    p_shipping_status: toSafeText(shippingStatus),
    p_payment_status: paymentStatus == null ? null : toSafeText(paymentStatus),
    p_payment_detail: paymentDetail == null ? null : toSafeText(paymentDetail),
    p_items: items,
  });

  if (error) {
    if (isProductReservationConflictError(error)) {
      return getRpcFailure({ code: "product_unavailable" });
    }
    console.error("[atomic-order] RPC failed", {
      code: error.code,
      message: error.message,
    });
    return getRpcFailure({ code: "atomic_checkout_failed" });
  }

  if (!data?.ok || !data?.order?.id) {
    return getRpcFailure(data);
  }

  return { ok: true, status: 200, order: data.order };
};
