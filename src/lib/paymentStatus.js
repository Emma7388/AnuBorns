export const PRODUCT_LOCKING_ORDER_STATUSES = new Set([
  "approved",
  "partially_refunded",
  "refund_pending",
]);

export const SALES_HISTORY_ORDER_STATUSES = new Set([
  "pending",
  "approved",
  "partially_refunded",
  "refund_pending",
  "refunded",
  "rejected",
  "cancelled",
  "canceled",
]);

export const DISPATCHABLE_ORDER_STATUSES = new Set(["approved"]);

const STATUS_MAP = {
  approved: "approved",
  pending: "pending",
  in_process: "pending",
  authorized: "pending",
  rejected: "rejected",
  cancelled: "cancelled",
  canceled: "cancelled",
  refunded: "refunded",
  charged_back: "refunded",
};

const REFUND_PENDING_DETAILS = new Set([
  "refund_in_progress",
  "movement_operations_pending",
]);

const REFUND_PENDING_REFUND_STATUSES = new Set([
  "processing",
  "pending",
  "in_process",
]);

const PAYMENT_DETAIL_LABELS = {
  accredited: "Acreditado",
  pending_contingency: "Pendiente de confirmación",
  pending_review_manual: "Pendiente de revisión",
  cc_rejected_bad_filled_card_number: "Pago rechazado",
  cc_rejected_bad_filled_date: "Pago rechazado",
  cc_rejected_bad_filled_other: "Pago rechazado",
  cc_rejected_bad_filled_security_code: "Pago rechazado",
  cc_rejected_blacklist: "Pago rechazado",
  cc_rejected_call_for_authorize: "Pago rechazado",
  cc_rejected_card_disabled: "Pago rechazado",
  cc_rejected_card_error: "Pago rechazado",
  cc_rejected_duplicated_payment: "Pago rechazado",
  cc_rejected_high_risk: "Pago rechazado",
  cc_rejected_insufficient_amount: "Pago rechazado",
  cc_rejected_invalid_installments: "Pago rechazado",
  cc_rejected_max_attempts: "Pago rechazado",
  cc_rejected_other_reason: "Pago rechazado",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial",
  refund_in_progress: "Reembolso en proceso",
  movement_operations_pending: "Movimientos pendientes",
  product_already_sold: "Producto ya vendido",
  amount_mismatch: "Importe inconsistente",
  currency_mismatch: "Moneda inconsistente",
  checkout_abandoned: "Checkout abandonado",
};

export const normalizePaymentStatus = (value) => {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "canceled") return "cancelled";
  return status;
};

const getRefundRows = (paymentData = {}) => {
  if (Array.isArray(paymentData?.refunds)) return paymentData.refunds;
  if (Array.isArray(paymentData?.transactions?.refunds)) return paymentData.transactions.refunds;
  return [];
};

export const getPaymentStatusLabel = (value) => {
  const labels = {
    approved: "Pago aprobado",
    pending: "Pago pendiente",
    rejected: "Pago rechazado",
    cancelled: "Pago cancelado",
    refunded: "Pago reembolsado",
    refund_pending: "Reembolso pendiente",
    partially_refunded: "Reembolso parcial",
  };
  return labels[normalizePaymentStatus(value)] ?? "Compra registrada";
};

export const getInternalPaymentStatusFromMercadoPago = (paymentData = {}) => {
  const status = String(paymentData?.status ?? "").trim().toLowerCase();
  const detail = String(paymentData?.status_detail ?? "").trim().toLowerCase();
  const hasPendingRefund = getRefundRows(paymentData).some((refund) =>
    REFUND_PENDING_REFUND_STATUSES.has(String(refund?.status ?? "").trim().toLowerCase()),
  );

  if (hasPendingRefund || REFUND_PENDING_DETAILS.has(detail)) return "refund_pending";
  if (detail === "refunded") return "refunded";
  if (detail === "partially_refunded") return "partially_refunded";
  return normalizePaymentStatus(STATUS_MAP[status] ?? status);
};

const cleanPaymentDetail = (value) => String(value ?? "").trim();

const parsePaymentDetailTrace = (value) => {
  const detail = cleanPaymentDetail(value);
  if (!detail) return {};
  return detail.split("|").reduce((data, part) => {
    const [key, ...rest] = part.split(":");
    if (!key || rest.length === 0) return data;
    return { ...data, [key]: rest.join(":").trim() };
  }, {});
};

export const mergeMercadoPagoPaymentDetail = (previousDetail, mercadoPagoStatusDetail) => {
  const previous = cleanPaymentDetail(previousDetail);
  const statusDetail = cleanPaymentDetail(mercadoPagoStatusDetail);

  if (!previous) return statusDetail || null;
  if (!statusDetail || previous === statusDetail) return previous;

  const isPreferenceTrace =
    previous.startsWith("mp_preference|") ||
    previous.includes("marketplace_fee:") ||
    previous.includes("oauth_seller:");

  if (!isPreferenceTrace) return statusDetail;

  const parts = previous
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith("mp_status_detail:"));

  return [...parts, `mp_status_detail:${statusDetail}`].join("|");
};

export const getReadablePaymentDetail = (value) => {
  const detail = cleanPaymentDetail(value);
  if (!detail) return "";

  const trace = parsePaymentDetailTrace(detail);
  const statusDetail = cleanPaymentDetail(trace.mp_status_detail || detail);
  const statusLabel = PAYMENT_DETAIL_LABELS[statusDetail.toLowerCase()] ?? statusDetail;
  const marketplaceFee = Number(trace.marketplace_fee ?? 0);

  if (trace.marketplace_fee && Number.isFinite(marketplaceFee) && marketplaceFee > 0) {
    return `${statusLabel} · comisión marketplace enviada: $${marketplaceFee.toLocaleString("es-AR")}`;
  }

  return statusLabel;
};

export const isProductLockedByOrderStatus = (value) =>
  PRODUCT_LOCKING_ORDER_STATUSES.has(normalizePaymentStatus(value));

export const isSaleVisibleInHistory = (value) =>
  SALES_HISTORY_ORDER_STATUSES.has(normalizePaymentStatus(value));

export const isSaleDispatchable = (value) =>
  DISPATCHABLE_ORDER_STATUSES.has(normalizePaymentStatus(value));
