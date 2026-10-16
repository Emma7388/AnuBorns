import { normalizePaymentStatus } from "./paymentStatus.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_ANOMALIES = new Set([
  "approved_without_payment_id",
  "approved_without_audit",
  "payment_detail_missing",
  "payment_state_mismatch",
  "stale_pending",
]);
const FULFILLMENT_ANOMALIES = new Set(["missing_dispatch", "fulfillment_delayed"]);
const CATALOG_ANOMALIES = new Set(["active_without_stock", "monthly_active_without_expiry"]);
const PASSIVE_FULFILLMENT_STATES = new Set(["", "pending", "requested", "pickup_pending"]);

const clean = (value) => String(value ?? "").trim();
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const toTimestamp = (value) => {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const getOrderState = (order) => normalizePaymentStatus(order?.payment_status || order?.status) || "unknown";
const getOrderItems = (order) => Array.isArray(order?.order_items) ? order.order_items : [];
const getDispatchKey = (orderId, productId) => `${clean(orderId)}::${clean(productId)}`;
const anomaly = (code, label, severity = "warning") => ({ code, label, severity });

const getAuditOrderId = (row) => clean(row?.metadata?.order_id);

const summarizeAnomalyGroups = (rows) => {
  const records = Array.isArray(rows) ? rows : [];
  return {
    alerts: records.filter((row) => row.anomalies.length > 0).length,
    critical: records.filter((row) => row.anomalies.some((item) => item.severity === "critical")).length,
    payment_alerts: records.filter((row) => row.anomalies.some((item) => PAYMENT_ANOMALIES.has(item.code))).length,
    fulfillment_alerts: records.filter((row) => row.anomalies.some((item) => FULFILLMENT_ANOMALIES.has(item.code))).length,
    catalog_alerts: records.filter((row) => row.anomalies.some((item) => CATALOG_ANOMALIES.has(item.code))).length,
  };
};

export const buildAdminOperationsSnapshot = ({
  orders = [],
  dispatches = [],
  products = [],
  auditLogs = [],
  now = Date.now(),
  pendingAfterMs = DAY_MS,
  fulfillmentAfterMs = DAY_MS,
} = {}) => {
  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const dispatchMap = new Map(
    (Array.isArray(dispatches) ? dispatches : []).map((row) => [
      getDispatchKey(row?.order_id, row?.product_id),
      row,
    ]),
  );
  const auditedOrderIds = new Set(
    (Array.isArray(auditLogs) ? auditLogs : [])
      .filter((row) => clean(row?.event) === "order_payment_status_changed")
      .map(getAuditOrderId)
      .filter(Boolean),
  );

  const orderRows = (Array.isArray(orders) ? orders : []).map((order) => {
    const state = getOrderState(order);
    const createdAtMs = toTimestamp(order?.created_at);
    const ageMs = createdAtMs ? Math.max(0, nowMs - createdAtMs) : 0;
    const status = normalizePaymentStatus(order?.status);
    const paymentStatus = normalizePaymentStatus(order?.payment_status);
    const items = getOrderItems(order).map((item) => ({
      product_id: clean(item?.product_id),
      name: clean(item?.name) || "Producto",
      provider: clean(item?.provider) || "Vendedor",
      qty: Math.max(1, Math.trunc(toNumber(item?.qty) || 1)),
    }));
    const anomalies = [];

    if (state === "pending" && ageMs >= Number(pendingAfterMs)) {
      anomalies.push(anomaly("stale_pending", "Pendiente por más de 24 horas"));
    }
    if (state === "approved" && !clean(order?.payment_id)) {
      anomalies.push(anomaly("approved_without_payment_id", "Aprobada sin Payment ID", "critical"));
    }
    if (state === "approved" && !clean(order?.payment_detail)) {
      anomalies.push(anomaly("payment_detail_missing", "Aprobada sin detalle de pago", "critical"));
    }
    if (state === "approved" && !auditedOrderIds.has(clean(order?.id))) {
      anomalies.push(anomaly("approved_without_audit", "Aprobada sin movimiento auditado"));
    }
    if (status && paymentStatus && status !== paymentStatus) {
      anomalies.push(anomaly("payment_state_mismatch", "Estados de orden y pago diferentes", "critical"));
    }

    if (state === "approved" && ageMs >= Number(fulfillmentAfterMs) && items.length) {
      const itemDispatches = items.map((item) => dispatchMap.get(getDispatchKey(order?.id, item.product_id)) ?? null);
      if (itemDispatches.some((row) => !row)) {
        anomalies.push(anomaly("missing_dispatch", "Venta aprobada sin seguimiento de entrega"));
      } else if (itemDispatches.some((row) => PASSIVE_FULFILLMENT_STATES.has(clean(row?.fulfillment_status).toLowerCase()))) {
        anomalies.push(anomaly("fulfillment_delayed", "Entrega sin avance por más de 24 horas"));
      }
    }

    return {
      kind: "order",
      id: clean(order?.id),
      created_at: order?.created_at ?? null,
      state,
      status,
      payment_status: paymentStatus,
      total_amount: toNumber(order?.total_amount),
      currency: clean(order?.currency) || "ARS",
      shipping_requested: Boolean(order?.shipping_requested),
      shipping_status: clean(order?.shipping_status),
      payment_id: clean(order?.payment_id),
      preference_id: clean(order?.preference_id),
      items,
      anomalies,
    };
  });

  const productRows = (Array.isArray(products) ? products : []).map((product) => {
    const status = clean(product?.publication_status).toLowerCase();
    const type = clean(product?.publication_type).toLowerCase();
    const stock = toNumber(product?.stock);
    const expiresAtMs = toTimestamp(product?.publication_expires_at);
    const anomalies = [];
    if (status === "active" && stock <= 0) {
      anomalies.push(anomaly("active_without_stock", "Publicación activa sin stock"));
    }
    if (status === "active" && type === "monthly" && !expiresAtMs) {
      anomalies.push(anomaly("monthly_active_without_expiry", "Mensual activa sin vencimiento", "critical"));
    }
    return {
      kind: "product",
      id: clean(product?.id),
      title: clean(product?.title) || "Producto",
      created_at: product?.created_at ?? null,
      publication_status: status || "unknown",
      publication_type: type || "permanent",
      publication_expires_at: product?.publication_expires_at ?? null,
      stock,
      anomalies,
    };
  });

  const anomalyRows = [...orderRows, ...productRows].filter((row) => row.anomalies.length > 0);
  const groups = summarizeAnomalyGroups(anomalyRows);
  const countState = (state) => orderRows.filter((order) => order.state === state).length;

  return {
    summary: {
      total_orders: orderRows.length,
      approved: countState("approved"),
      pending: countState("pending"),
      rejected: countState("rejected"),
      cancelled: countState("cancelled"),
      refunded: countState("refunded") + countState("partially_refunded") + countState("refund_pending"),
      ...groups,
    },
    orders: orderRows,
    catalog_alerts: productRows.filter((row) => row.anomalies.length > 0),
  };
};

export const ADMIN_OPERATION_ANOMALY_GROUPS = {
  payment: PAYMENT_ANOMALIES,
  fulfillment: FULFILLMENT_ANOMALIES,
  catalog: CATALOG_ANOMALIES,
};
