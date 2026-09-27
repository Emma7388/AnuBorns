import { supabase } from "../lib/supabaseClient";

const statusElement = document.getElementById("admin-health-status");
const tabsElement = document.getElementById("admin-health-tabs");
const listElement = document.getElementById("admin-health-list");
const notesElement = document.getElementById("admin-health-notes");
const okElement = document.getElementById("admin-health-ok");
const warningElement = document.getElementById("admin-health-warning");
const errorElement = document.getElementById("admin-health-error");
const metricsPanelElement = document.getElementById("admin-supabase-metrics");
const metricsMetaElement = document.getElementById("admin-supabase-metrics-meta");
const metricsListElement = document.getElementById("admin-supabase-metrics-list");

const setStatus = (message) => {
  if (statusElement) statusElement.textContent = message;
};

const state = {
  checks: [],
  selectedProcess: "",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const statusLabel = (status) => {
  if (status === "ok") return "OK";
  if (status === "warning") return "Revisar";
  return "Error";
};

const statusRank = (status) => {
  if (status === "error") return 3;
  if (status === "warning") return 2;
  if (status === "ok") return 1;
  return 0;
};

const getWorstStatus = (checks = []) =>
  checks.reduce((worst, check) => (
    statusRank(check?.status) > statusRank(worst) ? check.status : worst
  ), "ok");

const renderSummary = (summary = {}) => {
  if (okElement) okElement.textContent = String(summary.ok ?? 0);
  if (warningElement) warningElement.textContent = String(summary.warnings ?? 0);
  if (errorElement) errorElement.textContent = String(summary.errors ?? 0);
};

const getSummaryTotal = (summary = {}) =>
  Number(summary.ok ?? 0) + Number(summary.warnings ?? 0) + Number(summary.errors ?? 0);

const getProcessGroups = (checks = []) => {
  const groups = [];
  const byArea = new Map();
  checks.forEach((check) => {
    const area = String(check?.area ?? "General").trim() || "General";
    if (!byArea.has(area)) {
      const group = { area, checks: [] };
      byArea.set(area, group);
      groups.push(group);
    }
    byArea.get(area).checks.push(check);
  });
  return groups;
};

const renderTabs = (checks = []) => {
  if (!tabsElement) return;
  const groups = getProcessGroups(checks);
  if (groups.length === 0) {
    tabsElement.innerHTML = "";
    return;
  }
  if (!groups.some((group) => group.area === state.selectedProcess)) {
    state.selectedProcess = groups[0].area;
  }

  tabsElement.innerHTML = groups
    .map((group) => {
      const selected = group.area === state.selectedProcess;
      const status = getWorstStatus(group.checks);
      return `
        <button
          type="button"
          role="tab"
          aria-selected="${selected ? "true" : "false"}"
          class="ab-admin-health-tab ab-admin-health-tab--${escapeHtml(status)}${selected ? " is-selected" : ""}"
          data-admin-health-process="${escapeHtml(group.area)}"
          title="${escapeHtml(group.area)}"
        >
          <span>${escapeHtml(group.area)}</span>
          <small>${group.checks.length}</small>
        </button>
      `;
    })
    .join("");
};

const renderChecks = (checks = []) => {
  if (!listElement) return;
  if (!checks.length) {
    listElement.innerHTML = `<div class="ab-cart-empty"><p>No hay chequeos para mostrar.</p></div>`;
    return;
  }

  listElement.innerHTML = checks
    .map((check, index) => `
      <article class="ab-admin-health-card ab-admin-health-card--${escapeHtml(check.status)}">
        <div class="ab-admin-health-card__top">
          <span>Etapa ${index + 1}</span>
          <strong>${escapeHtml(statusLabel(check.status))}</strong>
        </div>
        <h3>${escapeHtml(check.label)}</h3>
        <p>${escapeHtml(check.detail)}</p>
        ${check.action ? `<small>${escapeHtml(check.action)}</small>` : ""}
      </article>
    `)
    .join("");
};

const renderSelectedProcess = () => {
  const groups = getProcessGroups(state.checks);
  const selectedGroup = groups.find((group) => group.area === state.selectedProcess) ?? groups[0];
  state.selectedProcess = selectedGroup?.area ?? "";
  renderTabs(state.checks);
  renderChecks(selectedGroup?.checks ?? []);
};

const renderNotes = (notes = []) => {
  if (!notesElement) return;
  notesElement.innerHTML = notes.length
    ? notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")
    : "";
};

const renderMetrics = (metrics = {}) => {
  if (!metricsPanelElement || !metricsListElement) return;

  const items = Array.isArray(metrics.items) ? metrics.items : [];
  const check = metrics.check ?? null;
  const configured = Boolean(metrics.configured);
  const sampledMetrics = Number(metrics.sampled_metrics ?? 0);

  if (metricsMetaElement) {
    metricsMetaElement.textContent = configured
      ? `${sampledMetrics} muestras`
      : "Configurar Metrics API";
  }

  if (!items.length) {
    metricsListElement.innerHTML = `
      <article class="ab-admin-metric-card ab-admin-metric-card--${escapeHtml(check?.status ?? "warning")}">
        <div class="ab-admin-metric-card__top">
          <span>${escapeHtml(statusLabel(check?.status ?? "warning"))}</span>
          <strong>${escapeHtml(check?.label ?? "Metrics API")}</strong>
        </div>
        <p>${escapeHtml(check?.detail ?? "No hay mediciones disponibles.")}</p>
        ${check?.action ? `<small>${escapeHtml(check.action)}</small>` : ""}
      </article>
    `;
    return;
  }

  metricsListElement.innerHTML = items
    .map((metric) => `
      <article class="ab-admin-metric-card ab-admin-metric-card--${escapeHtml(metric.status)}">
        <div class="ab-admin-metric-card__top">
          <span>${escapeHtml(statusLabel(metric.status))}</span>
          <strong>${escapeHtml(metric.label)}</strong>
        </div>
        <div class="ab-admin-metric-card__value">${escapeHtml(metric.value_display)}</div>
        <p>${escapeHtml(metric.detail)}</p>
      </article>
    `)
    .join("");
};

const loadHealth = async () => {
  setStatus("Cargando estado operativo...");
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    setStatus("Tenés que iniciar sesión para entrar al panel.");
    return;
  }

  const response = await fetch("/api/admin/health", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    setStatus(payload?.error ?? "No se pudo cargar el estado operativo.");
    renderSummary({ ok: 0, warnings: 0, errors: 1 });
    renderChecks([]);
    renderNotes([]);
    renderMetrics({});
    return;
  }

  const summary = payload.summary ?? {};
  renderSummary(summary);
  state.checks = Array.isArray(payload.checks) ? payload.checks : [];
  renderSelectedProcess();
  renderNotes(Array.isArray(payload.notes) ? payload.notes : []);
  renderMetrics(payload.metrics ?? {});
  const total = getSummaryTotal(summary);
  setStatus(`Estado actualizado: ${total} chequeos operativos · ${new Date(payload.generated_at).toLocaleString("es-AR")}`);
};

tabsElement?.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-admin-health-process]");
  if (!tab) return;
  state.selectedProcess = tab.getAttribute("data-admin-health-process") ?? "";
  renderSelectedProcess();
});

loadHealth().catch(() => {
  setStatus("No se pudo cargar el estado operativo.");
});
