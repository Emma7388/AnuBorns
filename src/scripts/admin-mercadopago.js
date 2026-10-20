import { supabase } from "../lib/supabaseClient";
import { renderAdminAccessState } from "../lib/adminPageAccess.js";
import {
  cleanText,
  escapeHtml as escapeText,
  formatCurrency,
  formatDateTime,
  shortId,
} from "../lib/displayFormat.js";

const adminRoot = document.querySelector(".ab-admin-mercadopago");
const statusElement = document.getElementById("admin-mp-status");
const sellersElement = document.getElementById("admin-mp-sellers");
const connectedElement = document.getElementById("admin-mp-connected");
const reconnectElement = document.getElementById("admin-mp-reconnect");
const localPendingElement = document.getElementById("admin-mp-local-pending");
const realPendingElement = document.getElementById("admin-mp-real-pending");
const reviewElement = document.getElementById("admin-mp-review");
const connectionFilter = document.getElementById("admin-mp-connection-filter");
const paymentFilter = document.getElementById("admin-mp-payment-filter");
const searchInput = document.getElementById("admin-mp-search");
const refreshButton = document.getElementById("admin-mp-refresh");
const verifyButton = document.getElementById("admin-mp-verify");
const encryptButton = document.getElementById("admin-mp-encrypt");
const listElement = document.getElementById("admin-mp-list");
const visibleCount = document.getElementById("admin-mp-visible-count");

let snapshot = { verification_mode: "local", summary: {}, sellers: [] };

const clean = cleanText;
const escapeHtml = (value) => escapeText(clean(value));
const formatDate = (value) => formatDateTime(value);
const formatMoney = (value, currency = "ARS") => formatCurrency(value, { currency });

const connectionLabel = (state) => ({
  active: "Conectado",
  expired_refreshable: "Token vencido, renovable",
  reconnect_required: "Debe reconectar",
  incomplete: "Conexión incompleta",
  not_connected: "Sin Mercado Pago",
}[clean(state)] ?? "Sin estado");
const connectionClass = (state) => {
  if (state === "active") return "is-ok";
  if (state === "expired_refreshable") return "is-warning";
  return "is-danger";
};
const identityLabel = (identity) => ({
  match: "Identidad coincidente",
  mismatch: "Identidad no coincidente",
  stored_mismatch: "MP User ID inconsistente",
  exception: "Excepción autorizada",
  unavailable: "Identidad no verificable",
  not_verified: "Identidad sin verificar",
  not_applicable: "No aplica",
}[clean(identity?.status)] ?? "Sin verificar");
const paymentKindLabel = (kind) => ({
  local_payment_pending: "Pendiente local con Payment ID",
  preference_unverified: "Preferencia local sin verificar",
  preference_only: "Preferencia sin intento de pago",
  mercadopago_pending: "Pago pendiente en Mercado Pago",
  mercadopago_resolved: "Mercado Pago ya lo resolvió",
  verification_unavailable: "No se pudo verificar",
}[clean(kind)] ?? "Intento registrado");
const paymentKindClass = (kind) => {
  if (kind === "mercadopago_resolved") return "is-danger";
  if (["mercadopago_pending", "verification_unavailable"].includes(kind)) return "is-warning";
  return "";
};

const renderSummary = () => {
  const summary = snapshot.summary ?? {};
  if (sellersElement) sellersElement.textContent = String(summary.sellers ?? 0);
  if (connectedElement) connectedElement.textContent = String(summary.connected ?? 0);
  if (reconnectElement) reconnectElement.textContent = String(summary.reconnect_required ?? 0);
  if (localPendingElement) localPendingElement.textContent = String(summary.local_pending_attempts ?? 0);
  if (realPendingElement) realPendingElement.textContent = snapshot.verification_mode === "live" ? String(summary.mercadopago_pending ?? 0) : "—";
  if (reviewElement) reviewElement.textContent = String(summary.records_to_review ?? 0);
};

const renderIssues = (issues = []) => {
  if (!issues.length) return `<span class="ab-admin-operation__ok">Sin alertas locales</span>`;
  return issues.map((item) => `
    <span class="ab-admin-operation__alert ${item.severity === "critical" ? "is-danger" : "is-warning"}">
      ${escapeHtml(item.label)}
    </span>
  `).join("");
};

const renderPendingOrder = (order) => {
  const products = order.products.map((product) => `${product.qty} × ${product.name}`).join(" · ") || "Sin productos";
  return `
    <article class="ab-admin-mp-payment">
      <div>
        <strong>Orden ${escapeHtml(shortId(order.order_id))}</strong>
        <small>${escapeHtml(products)}</small>
      </div>
      <div>
        <span class="ab-admin-overview__status ${paymentKindClass(order.kind)}">${escapeHtml(paymentKindLabel(order.kind))}</span>
        <small>${escapeHtml(formatMoney(order.total_amount, order.currency))} · ${escapeHtml(formatDate(order.created_at))}</small>
      </div>
      <div>
        <small>Payment ID</small>
        <strong>${escapeHtml(order.payment_id || "No registrado")}</strong>
      </div>
    </article>
  `;
};

const renderSeller = (seller) => {
  const critical = seller.issues.some((item) => item.severity === "critical");
  const userSearch = seller.email || seller.user_id;
  const userHref = `/admin/usuarios?q=${encodeURIComponent(userSearch)}`;
  return `
    <article class="ab-admin-mp-seller ${seller.issues.length ? "has-alerts" : ""} ${critical ? "has-critical" : ""}">
      <div class="ab-admin-mp-seller__head">
        <div>
          <p class="ab-admin-dashboard__eyebrow">Vendedor ${escapeHtml(shortId(seller.user_id))}</p>
          <h4>${escapeHtml(seller.label)}</h4>
          <small>${escapeHtml(seller.email || seller.user_id)}</small>
        </div>
        <div class="ab-admin-mp-seller__head-actions">
          <span class="ab-admin-overview__status ${connectionClass(seller.connection.state)}">${escapeHtml(connectionLabel(seller.connection.state))}</span>
          <a class="ab-secondary-button" href="${escapeHtml(userHref)}"><span>Ver usuario</span></a>
        </div>
      </div>
      <div class="ab-admin-mp-seller__facts">
        <span><small>MP User ID</small><strong>${escapeHtml(seller.connection.mp_user_id || "No registrado")}</strong></span>
        <span><small>Identidad</small><strong>${escapeHtml(identityLabel(seller.identity))}</strong></span>
        <span><small>Token vence</small><strong>${escapeHtml(formatDate(seller.connection.expires_at))}</strong></span>
        <span><small>Actividad</small><strong>${escapeHtml(`${seller.products_count} publicaciones · ${seller.sales_count} ventas`)}</strong></span>
      </div>
      <div class="ab-admin-operation__alerts">${renderIssues(seller.issues)}</div>
      <div class="ab-admin-mp-seller__payments">
        ${seller.pending_orders.length
          ? seller.pending_orders.map(renderPendingOrder).join("")
          : `<p class="ab-muted-text">Sin intentos locales pendientes.</p>`}
      </div>
    </article>
  `;
};

const connectionMatches = (seller, filter) => {
  if (filter === "all") return true;
  if (filter === "connected") return ["active", "expired_refreshable"].includes(seller.connection.state);
  if (filter === "attention") return seller.connection.state !== "active";
  return seller.connection.state === filter;
};

const renderList = () => {
  if (!listElement) return;
  const connection = clean(connectionFilter?.value || "all");
  const payment = clean(paymentFilter?.value || "all");
  const search = clean(searchInput?.value).toLowerCase();
  let rows = [...(snapshot.sellers ?? [])];
  rows = rows.filter((seller) => connectionMatches(seller, connection));
  if (payment === "local") rows = rows.filter((seller) => seller.pending_orders.length > 0);
  else if (payment !== "all") rows = rows.filter((seller) => seller.pending_orders.some((order) => order.kind === payment));
  if (search) rows = rows.filter((seller) => JSON.stringify(seller).toLowerCase().includes(search));

  if (visibleCount) visibleCount.textContent = `${rows.length} ${rows.length === 1 ? "registro" : "registros"}`;
  listElement.innerHTML = rows.length
    ? rows.map(renderSeller).join("")
    : `<div class="ab-cart-empty"><p>No hay registros para los filtros seleccionados.</p></div>`;
};

const loadMercadoPago = async ({ verify = false } = {}) => {
  if (statusElement) statusElement.textContent = verify ? "Consultando Mercado Pago en vivo..." : "Cargando datos locales...";
  if (refreshButton) refreshButton.disabled = true;
  if (verifyButton) verifyButton.disabled = true;
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    renderAdminAccessState({ root: adminRoot, response: { status: 401 } });
    if (refreshButton) refreshButton.disabled = false;
    if (verifyButton) verifyButton.disabled = false;
    return;
  }

  try {
    const response = await fetch(`/api/admin/mercadopago${verify ? "?verify=1" : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (renderAdminAccessState({ root: adminRoot, response, payload })) return;
    if (!response.ok) throw new Error(payload?.error || "No se pudo cargar Mercado Pago.");
    snapshot = payload;
    renderSummary();
    renderList();
    if (statusElement) {
      statusElement.textContent = payload.verification_mode === "live"
        ? `Verificación externa finalizada · ${formatDate(payload.generated_at)} · sólo lectura`
        : `Datos locales actualizados · ${formatDate(payload.generated_at)} · sin consultar Mercado Pago`;
    }
  } catch (error) {
    if (statusElement) statusElement.textContent = error?.message || "No se pudo cargar Mercado Pago.";
  } finally {
    if (refreshButton) refreshButton.disabled = false;
    if (verifyButton) verifyButton.disabled = false;
  }
};

const encryptOAuthTokens = async () => {
  if (!encryptButton || !statusElement) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    renderAdminAccessState({ root: adminRoot, response: { status: 401 } });
    return;
  }

  encryptButton.disabled = true;
  statusElement.textContent = "Cifrando tokens OAuth guardados...";
  try {
    const response = await fetch("/api/admin/mercadopago-token-encryption", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (renderAdminAccessState({ root: adminRoot, response, payload })) return;
    if (!response.ok) throw new Error(payload?.error || "No se pudieron cifrar los tokens OAuth.");
    statusElement.textContent = `Cifrado terminado: ${payload.migrated} conexiones actualizadas y ${payload.already_encrypted} ya protegidas.`;
  } catch (error) {
    statusElement.textContent = error?.message || "No se pudieron cifrar los tokens OAuth.";
  } finally {
    encryptButton.disabled = false;
  }
};

connectionFilter?.addEventListener("change", renderList);
paymentFilter?.addEventListener("change", renderList);
searchInput?.addEventListener("input", renderList);
refreshButton?.addEventListener("click", () => loadMercadoPago({ verify: false }));
verifyButton?.addEventListener("click", () => loadMercadoPago({ verify: true }));
encryptButton?.addEventListener("click", encryptOAuthTokens);
loadMercadoPago({ verify: false });
