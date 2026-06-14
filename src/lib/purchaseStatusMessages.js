const PURCHASE_STATUS_LABELS = {
  requested: "Envío solicitado",
  preparing: "Preparando envío",
  shipped: "Enviado",
  delivered: "Entregado",
  pickup_pending: "Retiro pendiente",
  ready_for_pickup: "Listo para retirar",
  picked_up: "Retirado",
  completed: "Completado",
  not_requested: "Sin envío",
};

const PURCHASE_STATUS_MESSAGES = {
  preparing: "Tu compra se está preparando.",
  shipped: "Tu compra fue enviada.",
  ready_for_pickup: "Tu compra está lista para retirar.",
  completed: "Gracias por tu compra.",
};

export const NOTIFIABLE_PURCHASE_STATUSES = new Set(Object.keys(PURCHASE_STATUS_MESSAGES));

export const formatPurchaseStatus = (value, requested = false) => {
  const statusValue = String(value ?? "").trim();
  if (!requested && (!statusValue || statusValue === "not_requested" || statusValue === "pickup_pending")) {
    return "Retiro pendiente";
  }
  return PURCHASE_STATUS_LABELS[statusValue] ?? PURCHASE_STATUS_LABELS.requested;
};

export const getPurchaseStatusReadKey = (item) =>
  [
    String(item?.orderId ?? "").trim(),
    String(item?.productId ?? "").trim(),
    String(item?.fulfillmentStatus ?? item?.status ?? "").trim(),
    String(item?.statusUpdatedAt ?? "").trim(),
  ].join("::");

export const shouldNotifyPurchaseStatus = (item) =>
  NOTIFIABLE_PURCHASE_STATUSES.has(String(item?.fulfillmentStatus ?? item?.status ?? "").trim());

export const getPurchaseStatusMessage = (item, count = 1) => {
  const safeCount = Math.max(1, Number(count ?? 1));
  if (safeCount > 1) return `${safeCount} productos actualizaron su estado.`;
  const status = String(item?.fulfillmentStatus ?? item?.status ?? "").trim();
  return PURCHASE_STATUS_MESSAGES[status] ?? `Producto actualizado: ${formatPurchaseStatus(status, item?.shippingRequested)}.`;
};

export const getPurchaseStatusToastStorageKey = (item) =>
  `ab_purchase_status_toast:${getPurchaseStatusReadKey(item)}`;
