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

const dayKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const formatDayLabel = (value) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
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
  const orders = Array.isArray(payload?.recent) ? payload.recent : [];
  const daily = orders
    .filter((order) => order?.fee_approved)
    .reduce((map, order) => {
      const key = dayKey(order.created_at);
      if (!key) return map;
      map.set(key, (map.get(key) ?? 0) + (Number(order.marketplace_fee) || 0));
      return map;
    }, new Map());

  const points = [...daily.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-10)
    .map(([date, total]) => ({ date, total }));

  if (!points.length) {
    chartElement.innerHTML = `<div class="ab-cart-empty"><p>No hay fee aprobado para graficar.</p></div>`;
    return;
  }

  const max = Math.max(...points.map((point) => point.total), 1);
  chartElement.innerHTML = points
    .map((point) => {
      const height = Math.max(8, Math.round((point.total / max) * 100));
      return `
        <div class="ab-admin-finance-chart__bar" title="${escapeHtml(`${formatDayLabel(point.date)} · ${formatMoney(point.total, currency)}`)}">
          <strong>${escapeHtml(formatMoney(point.total, currency))}</strong>
          <span style="height: ${height}%"></span>
          <small>${escapeHtml(formatDayLabel(point.date))}</small>
        </div>
      `;
    })
    .join("");
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
