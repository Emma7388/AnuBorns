import { compareMercadoPagoIdentity } from "./mercadopagoIdentity.js";
import { normalizePaymentStatus } from "./paymentStatus.js";

const clean = (value) => String(value ?? "").trim();
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const countBy = (rows, getStatus) => rows.reduce((counts, row) => {
  const status = clean(getStatus(row)).toLowerCase() || "unknown";
  counts[status] = (counts[status] ?? 0) + 1;
  return counts;
}, {});

const isMonthlyExpired = (product, nowMs) => {
  if (product?.publication_type !== "monthly") return false;
  const expiresAt = Date.parse(clean(product?.publication_expires_at));
  return Number.isFinite(expiresAt) && expiresAt <= nowMs;
};

export const getAdminProductVisibility = (product, now = Date.now()) => {
  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const active = clean(product?.publication_status) === "active";
  const hasStock = toNumber(product?.stock) > 0;
  const expired = isMonthlyExpired(product, nowMs);
  return {
    visible: active && hasStock && !expired,
    reason: !active
      ? clean(product?.publication_status) || "sin_estado"
      : !hasStock
        ? "sin_stock"
        : expired
          ? "vencida"
          : "visible",
  };
};

export const getAdminMercadoPagoDiagnostic = ({ connection, mpAccount, profile, authUser, liveError, now = Date.now() } = {}) => {
  const connected = Boolean(clean(connection?.mp_user_id) && clean(connection?.access_token));
  const expiresAtMs = Date.parse(clean(connection?.expires_at));
  const tokenExpired = Number.isFinite(expiresAtMs) && expiresAtMs <= Number(now);
  const storedMatchesLive = !mpAccount?.id || clean(mpAccount.id) === clean(connection?.mp_user_id);
  const identity = mpAccount?.id
    ? compareMercadoPagoIdentity({ mpAccount, profile, authUser })
    : { matches: false, exception: clean(connection?.mp_user_id) === "1157622469", mismatches: [] };
  const liveStatus = !connected ? "not_connected" : liveError ? "unavailable" : mpAccount?.id ? "verified" : "unavailable";

  return {
    connected,
    mp_user_id: clean(connection?.mp_user_id),
    connected_at: connection?.connected_at ?? null,
    updated_at: connection?.updated_at ?? null,
    expires_at: connection?.expires_at ?? null,
    token_expired: tokenExpired,
    live_status: liveStatus,
    live_error: liveError ? "No se pudo consultar Mercado Pago en este momento." : "",
    stored_matches_live: storedMatchesLive,
    identity_matches: Boolean(identity.matches && storedMatchesLive),
    identity_exception: Boolean(identity.exception),
    mismatches: Array.isArray(identity.mismatches) ? identity.mismatches : [],
    account: mpAccount?.id ? {
      id: clean(mpAccount.id),
      email: clean(mpAccount.email),
      first_name: clean(mpAccount.first_name),
      last_name: clean(mpAccount.last_name),
      identification_type: clean(mpAccount?.identification?.type),
      identification_number: clean(mpAccount?.identification?.number),
    } : null,
  };
};

const orderStatus = (order) => normalizePaymentStatus(order?.payment_status || order?.status) || "unknown";

const publicationEventLabel = (product) => {
  const status = clean(product?.publication_status);
  if (status === "active") return "Publicación activa";
  if (status === "expired") return "Publicación vencida";
  if (status === "pending_payment") return "Publicación pendiente de pago";
  if (status === "cancelled") return "Publicación cancelada";
  return "Publicación registrada";
};

const paymentEventLabel = (payment) => {
  const status = clean(payment?.payment_status || payment?.status);
  if (status === "approved") return "Pago mensual aprobado";
  if (status === "rejected") return "Pago mensual rechazado";
  if (status === "refunded") return "Pago mensual reembolsado";
  if (status === "cancelled") return "Pago mensual cancelado";
  return "Pago mensual pendiente";
};

const orderEventLabel = (prefix, row) => {
  const status = orderStatus(row);
  const labels = {
    approved: "aprobada",
    pending: "pendiente",
    rejected: "rechazada",
    cancelled: "cancelada",
    refunded: "reembolsada",
    partially_refunded: "con reembolso parcial",
    refund_pending: "con reembolso pendiente",
  };
  return `${prefix} ${labels[status] ?? "registrada"}`;
};

export const buildAdminUserTimeline = ({ products = [], publicationPayments = [], purchases = [], sales = [], audit = [] } = {}) => {
  const events = [
    ...products.map((product) => ({
      type: "publication",
      at: product?.publication_started_at || product?.created_at,
      title: publicationEventLabel(product),
      detail: clean(product?.title) || "Producto",
      status: clean(product?.publication_status),
    })),
    ...publicationPayments.map((payment) => ({
      type: "publication_payment",
      at: payment?.approved_at || payment?.updated_at || payment?.created_at,
      title: paymentEventLabel(payment),
      detail: clean(payment?.product_title) || "Publicación mensual",
      status: clean(payment?.payment_status || payment?.status),
    })),
    ...purchases.map((order) => ({
      type: "purchase",
      at: order?.created_at,
      title: orderEventLabel("Compra", order),
      detail: clean(order?.display_name) || clean(order?.id),
      status: orderStatus(order),
    })),
    ...sales.map((sale) => ({
      type: "sale",
      at: sale?.created_at,
      title: orderEventLabel("Venta", sale),
      detail: clean(sale?.display_name) || clean(sale?.order_id),
      status: orderStatus(sale),
    })),
    ...audit.map((row) => ({
      type: "audit",
      at: row?.created_at,
      title: clean(row?.label) || "Evento administrativo",
      detail: clean(row?.detail),
      status: clean(row?.status),
    })),
  ];

  return events
    .filter((event) => Number.isFinite(Date.parse(clean(event.at))))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, 60);
};

export const buildAdminUserOverview = ({
  products = [],
  publicationPayments = [],
  purchases = [],
  sales = [],
  audit = [],
  now = Date.now(),
} = {}) => {
  const formattedProducts = products.map((product) => ({
    ...product,
    ...getAdminProductVisibility(product, now),
  }));
  const purchaseCounts = countBy(purchases, orderStatus);
  const saleCounts = countBy(sales, orderStatus);
  const publicationCounts = countBy(formattedProducts, (product) => product.publication_status);
  const pendingFulfillment = sales.filter((sale) => {
    const status = clean(sale?.fulfillment_status).toLowerCase();
    return orderStatus(sale) === "approved" && !["completed", "shipped", "ready_for_pickup"].includes(status);
  }).length;
  const incidents =
    (purchaseCounts.rejected ?? 0) +
    (purchaseCounts.refund_pending ?? 0) +
    (saleCounts.rejected ?? 0) +
    (saleCounts.refund_pending ?? 0) +
    pendingFulfillment +
    formattedProducts.filter((product) => product.publication_status === "active" && !product.visible).length;

  return {
    summary: {
      publications: formattedProducts.length,
      visible_publications: formattedProducts.filter((product) => product.visible).length,
      purchases: purchases.length,
      sales: sales.length,
      pending_fulfillment: pendingFulfillment,
      incidents,
      publication_statuses: publicationCounts,
      purchase_statuses: purchaseCounts,
      sale_statuses: saleCounts,
    },
    products: formattedProducts,
    publication_payments: publicationPayments,
    purchases,
    sales,
    timeline: buildAdminUserTimeline({ products: formattedProducts, publicationPayments, purchases, sales, audit }),
  };
};
