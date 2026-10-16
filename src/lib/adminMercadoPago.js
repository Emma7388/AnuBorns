import { compareMercadoPagoIdentity } from "./mercadopagoIdentity.js";
import { normalizePaymentStatus } from "./paymentStatus.js";

const PENDING_MP_STATUSES = new Set(["pending", "in_process", "in_mediation", "authorized"]);

const clean = (value) => String(value ?? "").trim();
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const toTimestamp = (value) => {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const issue = (code, label, severity = "warning") => ({ code, label, severity });

const getConnectionState = (account, nowMs) => {
  if (!account) return "not_connected";
  if (!account.has_access_token || !clean(account.mp_user_id)) return "incomplete";
  const expiresAt = toTimestamp(account.expires_at);
  if (expiresAt && expiresAt <= nowMs) {
    return account.has_refresh_token ? "expired_refreshable" : "reconnect_required";
  }
  return "active";
};

const getIdentityState = ({ account, liveIdentity, profile, authUser, verificationMode }) => {
  if (!account?.has_access_token || !clean(account?.mp_user_id)) {
    return { status: "not_applicable", exception: false, mismatches: [], stored_matches_live: false };
  }
  if (verificationMode !== "live") {
    return {
      status: clean(account.mp_user_id) === "1157622469" ? "exception" : "not_verified",
      exception: clean(account.mp_user_id) === "1157622469",
      mismatches: [],
      stored_matches_live: false,
    };
  }
  if (!liveIdentity?.ok || !liveIdentity?.account?.id) {
    return { status: "unavailable", exception: false, mismatches: [], stored_matches_live: false };
  }

  const storedMatchesLive = clean(liveIdentity.account.id) === clean(account.mp_user_id);
  const identity = compareMercadoPagoIdentity({ mpAccount: liveIdentity.account, profile, authUser });
  return {
    status: !storedMatchesLive
      ? "stored_mismatch"
      : identity.exception
        ? "exception"
        : identity.matches
          ? "match"
          : "mismatch",
    exception: Boolean(identity.exception),
    mismatches: Array.isArray(identity.mismatches) ? identity.mismatches : [],
    stored_matches_live: storedMatchesLive,
  };
};

const getPaymentKind = ({ order, check, verificationMode }) => {
  if (verificationMode !== "live") {
    return clean(order.payment_id) ? "local_payment_pending" : "preference_unverified";
  }
  if (!check?.ok) return "verification_unavailable";
  if (!check.payment?.id) return "preference_only";
  const rawStatus = clean(check.payment.status).toLowerCase();
  return PENDING_MP_STATUSES.has(rawStatus) ? "mercadopago_pending" : "mercadopago_resolved";
};

const buildPendingOrder = ({ order, check, verificationMode }) => {
  const rawPaymentStatus = clean(check?.payment?.status || order?.payment_status);
  return {
    order_id: clean(order?.order_id || order?.id),
    created_at: order?.created_at ?? null,
    total_amount: toNumber(order?.total_amount),
    currency: clean(order?.currency) || "ARS",
    preference_id: clean(order?.preference_id),
    payment_id: clean(check?.payment?.id || order?.payment_id),
    payment_status: normalizePaymentStatus(rawPaymentStatus),
    kind: getPaymentKind({ order, check, verificationMode }),
    products: Array.isArray(order?.products) ? order.products.map((product) => ({
      name: clean(product?.name) || "Producto",
      qty: Math.max(1, Math.trunc(toNumber(product?.qty) || 1)),
    })) : [],
  };
};

export const buildAdminMercadoPagoSnapshot = ({
  sellers = [],
  accounts = [],
  pendingOrders = [],
  liveIdentities = [],
  paymentChecks = [],
  verificationMode = "local",
  now = Date.now(),
} = {}) => {
  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const mode = verificationMode === "live" ? "live" : "local";
  const accountMap = new Map((accounts ?? []).map((row) => [clean(row?.user_id), row]));
  const identityMap = new Map((liveIdentities ?? []).map((row) => [clean(row?.user_id), row]));
  const paymentMap = new Map((paymentChecks ?? []).map((row) => [clean(row?.order_id), row]));
  const ordersBySeller = new Map();

  for (const order of pendingOrders ?? []) {
    const sellerId = clean(order?.seller_user_id);
    if (!sellerId) continue;
    const rows = ordersBySeller.get(sellerId) ?? [];
    rows.push(buildPendingOrder({ order, check: paymentMap.get(clean(order?.order_id || order?.id)), verificationMode: mode }));
    ordersBySeller.set(sellerId, rows);
  }

  const rows = (sellers ?? []).map((seller) => {
    const userId = clean(seller?.user_id || seller?.id);
    const account = accountMap.get(userId) ?? null;
    const connectionState = getConnectionState(account, nowMs);
    const identity = getIdentityState({
      account,
      liveIdentity: identityMap.get(userId),
      profile: seller?.profile,
      authUser: seller?.auth_user,
      verificationMode: mode,
    });
    const orders = ordersBySeller.get(userId) ?? [];
    const issues = [];

    if (connectionState === "not_connected") issues.push(issue("not_connected", "Vendedor sin Mercado Pago conectado"));
    if (connectionState === "incomplete") issues.push(issue("connection_incomplete", "Conexión OAuth incompleta", "critical"));
    if (connectionState === "reconnect_required") issues.push(issue("reconnect_required", "Token vencido sin credencial de renovación", "critical"));
    if (identity.status === "mismatch") issues.push(issue("identity_mismatch", `Identidad no coincidente: ${identity.mismatches.join(", ")}`, "critical"));
    if (identity.status === "stored_mismatch") issues.push(issue("stored_user_mismatch", "El MP User ID guardado no coincide con la cuenta consultada", "critical"));
    if (identity.status === "unavailable") issues.push(issue("identity_unavailable", "Mercado Pago no pudo verificar la identidad"));
    if (orders.some((order) => order.kind === "mercadopago_pending")) issues.push(issue("mercadopago_pending", "Pago realmente pendiente en Mercado Pago"));
    if (orders.some((order) => order.kind === "mercadopago_resolved")) issues.push(issue("local_pending_resolved", "Mercado Pago resolvió una orden que continúa pendiente localmente", "critical"));
    if (orders.some((order) => order.kind === "verification_unavailable")) issues.push(issue("payment_unavailable", "No se pudo verificar un intento pendiente"));

    return {
      user_id: userId,
      label: clean(seller?.label) || clean(seller?.email) || "Vendedor",
      email: clean(seller?.email),
      products_count: Math.max(0, Math.trunc(toNumber(seller?.products_count))),
      sales_count: Math.max(0, Math.trunc(toNumber(seller?.sales_count))),
      connection: {
        state: connectionState,
        connected: Boolean(account?.has_access_token && clean(account?.mp_user_id)),
        mp_user_id: clean(account?.mp_user_id),
        expires_at: account?.expires_at ?? null,
        connected_at: account?.connected_at ?? null,
        updated_at: account?.updated_at ?? null,
        refresh_available: Boolean(account?.has_refresh_token),
      },
      identity,
      pending_orders: orders,
      issues,
    };
  }).sort((left, right) => left.label.localeCompare(right.label, "es"));

  const allPendingOrders = rows.flatMap((row) => row.pending_orders);
  const connectedStates = new Set(["active", "expired_refreshable"]);
  return {
    verification_mode: mode,
    summary: {
      sellers: rows.length,
      connected: rows.filter((row) => connectedStates.has(row.connection.state)).length,
      reconnect_required: rows.filter((row) => ["not_connected", "incomplete", "reconnect_required"].includes(row.connection.state)).length,
      local_pending_attempts: allPendingOrders.length,
      mercadopago_pending: allPendingOrders.filter((order) => order.kind === "mercadopago_pending").length,
      records_to_review: rows.filter((row) => row.issues.length > 0).length,
      critical: rows.filter((row) => row.issues.some((item) => item.severity === "critical")).length,
    },
    sellers: rows,
  };
};

export const ADMIN_MP_PENDING_STATUSES = PENDING_MP_STATUSES;
