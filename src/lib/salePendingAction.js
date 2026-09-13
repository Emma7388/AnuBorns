import { isSaleDispatchable } from "./paymentStatus.js";

export const getNextFulfillmentAction = (status, shippingRequested) => {
  const raw = String(status ?? "").trim();
  if (shippingRequested) {
    if (!raw || raw === "pending" || raw === "requested") {
      return { status: "preparing", label: "Preparar envío" };
    }
    if (raw === "preparing") return { status: "shipped", label: "Marcar enviado" };
    if (raw === "delivered") return { status: "completed", label: "Completar circuito" };
    return null;
  }
  if (!raw || raw === "pending" || raw === "pickup_pending") {
    return { status: "ready_for_pickup", label: "Listo para retirar" };
  }
  if (raw === "picked_up") return { status: "completed", label: "Completar circuito" };
  return null;
};


export const getPendingSaleItems = (items = []) => items.flatMap((item) => {
  const sales = (Array.isArray(item?.salesHistory) ? item.salesHistory : [])
    .filter((sale) =>
      sale?.orderId &&
      isSaleDispatchable(sale.orderStatus || "approved") &&
      getNextFulfillmentAction(sale.fulfillmentStatus, sale.shippingRequested)
    );
  return sales.map((sale) => ({ ...item, lastSoldAt: sale.soldAt, lastOrderId: sale.orderId }));
});
