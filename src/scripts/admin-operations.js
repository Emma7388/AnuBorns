import { supabase } from "../lib/supabaseClient";

const statusElement = document.getElementById("admin-operations-status");
const totalElement = document.getElementById("admin-operations-total");
const approvedElement = document.getElementById("admin-operations-approved");
const pendingElement = document.getElementById("admin-operations-pending");
const alertsElement = document.getElementById("admin-operations-alerts");
const criticalElement = document.getElementById("admin-operations-critical");
const stateFilter = document.getElementById("admin-operations-state-filter");
const focusFilter = document.getElementById("admin-operations-focus-filter");
const searchInput = document.getElementById("admin-operations-search");
const refreshButton = document.getElementById("admin-operations-refresh");
const listElement = document.getElementById("admin-operations-list");
const listTitle = document.getElementById("admin-operations-list-title");
const visibleCount = document.getElementById("admin-operations-visible-count");

const PAYMENT_CODES = new Set(["approved_without_payment_id", "approved_without_audit", "payment_detail_missing", "payment_state_mismatch", "stale_pending"]);
const FULFILLMENT_CODES = new Set(["missing_dispatch", "fulfillment_delayed"]);
const CATALOG_CODES = new Set(["active_without_stock", "monthly_active_without_expiry"]);
let snapshot = { summary: {}, orders: [], catalog_alerts: [] };

const clean = (value) => String(value ?? "").trim();
const escapeHtml = (value) => clean(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const shortId = (value) => clean(value).slice(0, 8).toUpperCase() || "SIN ID";
const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date);
};
const formatMoney = (value, currency = "ARS") => new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: clean(currency) || "ARS",
  maximumFractionDigits: 0,
}).format(Number(value) || 0);
const statusLabel = (value) => ({
  approved: "Aprobado",
  pending: "Pendiente",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  refund_pending: "Reembolso pendiente",
  partially_refunded: "Reembolso parcial",
}[clean(value).toLowerCase()] ?? (clean(value) || "Sin estado"));
const statusClass = (value) => {
  const state = clean(value).toLowerCase();
  if (state === "approved") return "is-ok";
  if (["pending", "refund_pending", "partially_refunded"].includes(state)) return "is-warning";
  if (["rejected", "cancelled", "refunded"].includes(state)) return "is-danger";
  return "";
};
const anomalyMatches = (row, codes) => row.anomalies.some((item) => codes.has(item.code));

const renderSummary = () => {
  const summary = snapshot.summary ?? {};
  if (totalElement) totalElement.textContent = String(summary.total_orders ?? 0);
  if (approvedElement) approvedElement.textContent = String(summary.approved ?? 0);
  if (pendingElement) pendingElement.textContent = String(summary.pending ?? 0);
  if (alertsElement) alertsElement.textContent = String(summary.alerts ?? 0);
  if (criticalElement) criticalElement.textContent = String(summary.critical ?? 0);
};

const renderAnomalies = (anomalies = []) => {
  if (!anomalies.length) return `<span class="ab-admin-operation__ok">Sin alertas locales</span>`;
  return anomalies.map((item) => `
    <span class="ab-admin-operation__alert ${item.severity === "critical" ? "is-danger" : "is-warning"}">
      ${escapeHtml(item.label)}
    </span>
  `).join("");
};

const renderOrder = (order) => {
  const itemText = order.items.map((item) => `${item.qty} × ${item.name} · ${item.provider}`).join(" | ") || "Orden sin productos";
  return `
    <article class="ab-admin-operation ${order.anomalies.length ? "has-alerts" : ""}">
      <div class="ab-admin-operation__head">
        <div>
          <p class="ab-admin-dashboard__eyebrow">Orden ${escapeHtml(shortId(order.id))}</p>
          <h4>${escapeHtml(itemText)}</h4>
        </div>
        <span class="ab-admin-overview__status ${statusClass(order.state)}">${escapeHtml(statusLabel(order.state))}</span>
      </div>
      <div class="ab-admin-operation__facts">
        <span><small>Fecha</small><strong>${escapeHtml(formatDate(order.created_at))}</strong></span>
        <span><small>Importe</small><strong>${escapeHtml(formatMoney(order.total_amount, order.currency))}</strong></span>
        <span><small>Payment ID</small><strong>${escapeHtml(order.payment_id || "No registrado")}</strong></span>
        <span><small>Entrega</small><strong>${escapeHtml(order.shipping_requested ? "Envío" : "Retiro")}</strong></span>
      </div>
      <div class="ab-admin-operation__alerts">${renderAnomalies(order.anomalies)}</div>
    </article>
  `;
};

const renderProduct = (product) => `
  <article class="ab-admin-operation has-alerts">
    <div class="ab-admin-operation__head">
      <div>
        <p class="ab-admin-dashboard__eyebrow">Publicación ${escapeHtml(shortId(product.id))}</p>
        <h4>${escapeHtml(product.title)}</h4>
      </div>
      <span class="ab-admin-overview__status is-warning">${escapeHtml(product.publication_type === "monthly" ? "Mensual" : "Permanente")}</span>
    </div>
    <div class="ab-admin-operation__facts">
      <span><small>Estado</small><strong>${escapeHtml(product.publication_status)}</strong></span>
      <span><small>Stock</small><strong>${escapeHtml(product.stock)}</strong></span>
      <span><small>Vencimiento</small><strong>${escapeHtml(formatDate(product.publication_expires_at))}</strong></span>
    </div>
    <div class="ab-admin-operation__alerts">${renderAnomalies(product.anomalies)}</div>
  </article>
`;

const renderList = () => {
  if (!listElement) return;
  const state = clean(stateFilter?.value || "all");
  const focus = clean(focusFilter?.value || "all");
  const search = clean(searchInput?.value).toLowerCase();
  let rows = focus === "catalog" ? [...snapshot.catalog_alerts] : [...snapshot.orders];

  if (focus !== "catalog" && state !== "all") rows = rows.filter((row) => row.state === state);
  if (focus === "alerts") rows = rows.filter((row) => row.anomalies.length);
  if (focus === "payment") rows = rows.filter((row) => anomalyMatches(row, PAYMENT_CODES));
  if (focus === "fulfillment") rows = rows.filter((row) => anomalyMatches(row, FULFILLMENT_CODES));
  if (search) {
    rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search));
  }

  if (listTitle) listTitle.textContent = focus === "catalog" ? "Publicaciones a revisar" : "Órdenes recientes";
  if (visibleCount) visibleCount.textContent = `${rows.length} ${rows.length === 1 ? "registro" : "registros"}`;
  listElement.innerHTML = rows.length
    ? rows.map((row) => row.kind === "product" ? renderProduct(row) : renderOrder(row)).join("")
    : `<div class="ab-cart-empty"><p>No hay registros para los filtros seleccionados.</p></div>`;
};

const loadOperations = async () => {
  if (statusElement) statusElement.textContent = "Cargando control global...";
  if (refreshButton) refreshButton.disabled = true;
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    if (statusElement) statusElement.textContent = "Tenés que iniciar sesión para entrar al panel.";
    if (refreshButton) refreshButton.disabled = false;
    return;
  }
  try {
    const response = await fetch("/api/admin/operations", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "No se pudo cargar el control global.");
    snapshot = payload;
    renderSummary();
    renderList();
    if (statusElement) statusElement.textContent = `Datos actualizados · ${formatDate(payload.generated_at)} · sólo lectura`;
  } catch (error) {
    if (statusElement) statusElement.textContent = error?.message || "No se pudo cargar el control global.";
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
};

stateFilter?.addEventListener("change", renderList);
focusFilter?.addEventListener("change", renderList);
searchInput?.addEventListener("input", renderList);
refreshButton?.addEventListener("click", loadOperations);
loadOperations();
