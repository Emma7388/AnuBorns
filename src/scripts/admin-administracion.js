import { supabase } from "../lib/supabaseClient";

const statusElement = document.getElementById("admin-finance-status");
const approvedFeeElement = document.getElementById("admin-fee-approved");
const registeredFeeElement = document.getElementById("admin-fee-registered");
const feeOrdersElement = document.getElementById("admin-fee-orders");
const detailElement = document.getElementById("admin-finance-detail");
const chartElement = document.getElementById("admin-finance-chart");
const ordersElement = document.getElementById("admin-finance-orders");

const setStatus = (message) => {
  if (statusElement) statusElement.textContent = message;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatMoney = (value, currency = "ARS") =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const statusLabel = (order) => {
  if (order?.fee_approved) return "Aprobado";
  const state = String(order?.payment_state ?? "").toLowerCase();
  if (state === "pending") return "Pendiente";
  if (state === "rejected") return "Rechazado";
  if (state === "cancelled" || state === "canceled") return "Cancelado";
  if (state === "refunded") return "Reembolsado";
  return state || "-";
};

const formatPercent = (value, total) => {
  const safeTotal = Number(total) || 0;
  if (safeTotal <= 0) return "0%";
  return `${Math.round(((Number(value) || 0) / safeTotal) * 100)}%`;
};

const renderSummary = (payload) => {
  const summary = payload?.summary ?? {};
  const currency = payload?.currency ?? "ARS";
  if (approvedFeeElement) approvedFeeElement.textContent = formatMoney(summary.approved_fee_total, currency);
  if (registeredFeeElement) registeredFeeElement.textContent = formatMoney(summary.registered_fee_total, currency);
  if (feeOrdersElement) feeOrdersElement.textContent = String(summary.fee_orders ?? 0);

  if (!detailElement) return;
  detailElement.innerHTML = `
    <div class="ab-admin-users__detail-row">
      <span>Órdenes revisadas</span>
      <strong>${escapeHtml(summary.reviewed_orders ?? 0)}</strong>
    </div>
    <div class="ab-admin-users__detail-row">
      <span>Con traza MP</span>
      <strong>${escapeHtml(summary.traced_orders ?? 0)}</strong>
    </div>
    <div class="ab-admin-users__detail-row">
      <span>Fee pendiente</span>
      <strong>${escapeHtml(formatMoney(summary.pending_fee_total, currency))}</strong>
    </div>
    <div class="ab-admin-users__detail-row">
      <span>Órdenes aprobadas</span>
      <strong>${escapeHtml(summary.approved_fee_orders ?? 0)}</strong>
    </div>
  `;
};

const renderOrders = (payload) => {
  if (!ordersElement) return;
  const currency = payload?.currency ?? "ARS";
  const orders = Array.isArray(payload?.recent) ? payload.recent : [];
  if (!orders.length) {
    ordersElement.innerHTML = `<div class="ab-cart-empty"><p>No hay órdenes con fee registrado.</p></div>`;
    return;
  }

  ordersElement.innerHTML = orders
    .map((order) => `
      <article class="ab-admin-finance-order">
        <div>
          <strong>${escapeHtml(String(order.id ?? "").slice(0, 8).toUpperCase())}</strong>
          <span>${escapeHtml(formatDate(order.created_at))}</span>
        </div>
        <div>
          <strong>${escapeHtml(formatMoney(order.marketplace_fee, currency))}</strong>
          <span>${escapeHtml(statusLabel(order))}</span>
        </div>
      </article>
    `)
    .join("");
};

const renderChart = (payload) => {
  if (!chartElement) return;
  const currency = payload?.currency ?? "ARS";
  const summary = payload?.summary ?? {};
  const approved = Math.max(0, Number(summary.approved_fee_total) || 0);
  const pending = Math.max(0, Number(summary.pending_fee_total) || 0);
  const registered = Math.max(0, Number(summary.registered_fee_total) || 0);
  const other = Math.max(0, registered - approved - pending);
  const total = Math.max(0, approved + pending + other);

  if (total <= 0) {
    chartElement.innerHTML = `<div class="ab-cart-empty"><p>No hay fee registrado para graficar.</p></div>`;
    return;
  }

  const approvedAngle = (approved / total) * 360;
  const pendingAngle = ((approved + pending) / total) * 360;

  chartElement.innerHTML = `
    <div class="ab-admin-finance-pie" style="--approved-angle: 0deg; --pending-angle: 0deg;" aria-hidden="true">
      <div class="ab-admin-finance-pie__center">
        <strong>${escapeHtml(formatMoney(registered, currency))}</strong>
        <span>Registrado</span>
      </div>
    </div>
    <div class="ab-admin-finance-legend">
      <div class="ab-admin-finance-legend__item ab-admin-finance-legend__item--approved">
        <span></span>
        <div>
          <strong>${escapeHtml(formatMoney(approved, currency))}</strong>
          <small>Aprobado · ${escapeHtml(formatPercent(approved, total))}</small>
        </div>
      </div>
      <div class="ab-admin-finance-legend__item ab-admin-finance-legend__item--pending">
        <span></span>
        <div>
          <strong>${escapeHtml(formatMoney(pending, currency))}</strong>
          <small>Pendiente · ${escapeHtml(formatPercent(pending, total))}</small>
        </div>
      </div>
      <div class="ab-admin-finance-legend__item ab-admin-finance-legend__item--other">
        <span></span>
        <div>
          <strong>${escapeHtml(formatMoney(other, currency))}</strong>
          <small>Otros · ${escapeHtml(formatPercent(other, total))}</small>
        </div>
      </div>
    </div>
  `;

  const pieElement = chartElement.querySelector(".ab-admin-finance-pie");
  window.requestAnimationFrame(() => {
    pieElement?.style.setProperty("--approved-angle", `${approvedAngle}deg`);
    pieElement?.style.setProperty("--pending-angle", `${pendingAngle}deg`);
  });
};

const loadAdministration = async () => {
  setStatus("Cargando administración...");
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    setStatus("Tenés que iniciar sesión para entrar al panel.");
    return;
  }

  const response = await fetch("/api/admin/administracion", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    setStatus(payload?.error ?? "No se pudo cargar la administración.");
    renderSummary({ summary: {}, recent: [] });
    renderChart({ recent: [] });
    renderOrders({ recent: [] });
    return;
  }

  renderSummary(payload);
  renderChart(payload);
  renderOrders(payload);
  setStatus(`Administración actualizada · ${formatDate(payload.generated_at)}`);
};

loadAdministration().catch(() => {
  setStatus("No se pudo cargar la administración.");
});
