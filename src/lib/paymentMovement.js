const trimValue = (value, maxLength = 500) =>
  String(value ?? "").trim().slice(0, maxLength);

const getRefundSnapshot = (paymentData = {}) => {
  const refunds = Array.isArray(paymentData?.refunds)
    ? paymentData.refunds
    : Array.isArray(paymentData?.transactions?.refunds)
      ? paymentData.transactions.refunds
      : [];

  return refunds.slice(0, 10).map((refund) => ({
    id: trimValue(refund?.id, 120),
    amount: trimValue(refund?.amount, 80),
    status: trimValue(refund?.status, 80),
  }));
};

export const recordOrderPaymentMovement = async (
  supabaseAdmin,
  {
    order,
    orderId,
    source = "payment",
    nextStatus = "",
    paymentStatus = "",
    paymentId = "",
    paymentDetail = "",
    paymentData = {},
  } = {},
) => {
  const safeOrderId = trimValue(orderId || order?.id, 120);
  const userId = trimValue(order?.user_id, 120);
  if (!supabaseAdmin || !safeOrderId || !userId) return;

  const previous = {
    status: trimValue(order?.status, 80),
    payment_status: trimValue(order?.payment_status, 80),
    payment_id: trimValue(order?.payment_id, 120),
    payment_detail: trimValue(order?.payment_detail, 500),
  };
  const next = {
    status: trimValue(nextStatus, 80),
    payment_status: trimValue(paymentStatus, 80),
    payment_id: trimValue(paymentId, 120),
    payment_detail: trimValue(paymentDetail, 500),
  };

  const changed = Object.keys(next).some((key) => previous[key] !== next[key]);
  if (!changed) return;

  const metadata = {
    order_id: safeOrderId,
    source: trimValue(source, 80),
    previous,
    next,
    mercado_pago: {
      status: trimValue(paymentData?.status, 80),
      status_detail: trimValue(paymentData?.status_detail, 120),
      external_reference: trimValue(paymentData?.external_reference, 120),
      refunds: getRefundSnapshot(paymentData),
    },
  };

  const { error } = await supabaseAdmin.from("audit_logs").insert({
    user_id: userId,
    event: "order_payment_status_changed",
    metadata,
    ip_address: null,
    user_agent: trimValue(source, 300),
  });

  if (error) {
    console.error("[payment-movement] Audit insert failed", {
      orderId: safeOrderId,
      error: error.message,
    });
  }
};
