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
const metricsRefreshButton = document.getElementById("admin-supabase-metrics-refresh");
const usagePanelElement = document.getElementById("admin-supabase-usage");
const usageMetaElement = document.getElementById("admin-supabase-usage-meta");
const usageListElement = document.getElementById("admin-supabase-usage-list");
const analyticsPanelElement = document.getElementById("admin-vercel-analytics");
const analyticsMetaElement = document.getElementById("admin-vercel-analytics-meta");
const analyticsListElement = document.getElementById("admin-vercel-analytics-list");
const analyticsRefreshButton = document.getElementById("admin-vercel-analytics-refresh");

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

const summarizeChecks = (checks = []) => ({
  ok: checks.filter((check) => check.status === "ok").length,
  warnings: checks.filter((check) => check.status === "warning").length,
  errors: checks.filter((check) => check.status === "error").length,
});

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
    metricsMetaElement.textContent = metrics.pending
      ? "Consulta manual"
      : configured
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

const renderUsage = (usage = {}) => {
  if (!usagePanelElement || !usageListElement) return;

  const items = Array.isArray(usage.items) ? usage.items : [];
  const unavailable = Array.isArray(usage.unavailable) ? usage.unavailable : [];
  const generatedAt = usage.generated_at ? new Date(usage.generated_at) : null;

  if (usageMetaElement) {
    usageMetaElement.textContent = generatedAt && !Number.isNaN(generatedAt.getTime())
      ? generatedAt.toLocaleString("es-AR")
      : "Consulta manual";
  }

  if (!items.length && !unavailable.length) {
    usageListElement.innerHTML = `
      <article class="ab-admin-metric-card ab-admin-metric-card--warning">
        <div class="ab-admin-metric-card__top">
          <span>Manual</span>
          <strong>Uso del plan</strong>
        </div>
        <p>Toca Consultar para leer los datos livianos disponibles.</p>
      </article>
    `;
    return;
  }

  const cardsHtml = items
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

  const unavailableHtml = unavailable.length
    ? `
      <aside class="ab-admin-usage-note">
        <strong>Datos que se revisan en Supabase Usage</strong>
        <div>
          ${unavailable.map((item) => `
            <span>
              ${escapeHtml(item.label)}
              <small>${escapeHtml(item.limit_display ? `limite ${item.limit_display}` : item.detail)}</small>
            </span>
          `).join("")}
        </div>
      </aside>
    `
    : "";

  usageListElement.innerHTML = `${cardsHtml}${unavailableHtml}`;
};

const renderAnalytics = (analytics = {}) => {
  if (!analyticsPanelElement || !analyticsListElement) return;

  const items = Array.isArray(analytics.items) ? analytics.items : [];
  const sections = Array.isArray(analytics.sections) ? analytics.sections : [];
  const check = analytics.check ?? null;
  const configured = Boolean(analytics.configured);
  const generatedAt = analytics.generated_at ? new Date(analytics.generated_at) : null;

  if (analyticsMetaElement) {
    analyticsMetaElement.textContent = analytics.pending
      ? "Consulta manual"
      : generatedAt && !Number.isNaN(generatedAt.getTime())
      ? generatedAt.toLocaleString("es-AR")
      : configured
      ? "Sin fecha"
      : "Configurar API";
  }

  if (!items.length) {
    analyticsListElement.innerHTML = `
      <article class="ab-admin-metric-card ab-admin-metric-card--${escapeHtml(check?.status ?? "warning")}">
        <div class="ab-admin-metric-card__top">
          <span>${escapeHtml(statusLabel(check?.status ?? "warning"))}</span>
          <strong>${escapeHtml(check?.label ?? "Vercel Analytics")}</strong>
        </div>
        <p>${escapeHtml(check?.detail ?? "Toca Consultar para leer Vercel Web Analytics.")}</p>
        ${check?.action ? `<small>${escapeHtml(check.action)}</small>` : ""}
      </article>
    `;
    return;
  }

  const cardsHtml = items
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

  const sectionsHtml = sections.length
    ? `
      <div class="ab-admin-analytics-sections">
        ${sections.map((section) => `
          <article class="ab-admin-analytics-section">
            <strong>${escapeHtml(section.label)}</strong>
            <div>
              ${Array.isArray(section.rows) && section.rows.length
                ? section.rows.map((row) => `
                  <span>
                    ${escapeHtml(row.label)}
                    <small>${escapeHtml(row.pageviews ?? 0)} pv${row.visitors ? ` - ${escapeHtml(row.visitors)} vis.` : ""}</small>
                  </span>
                `).join("")
                : `<em>${escapeHtml(section.empty ?? "Sin datos.")}</em>`}
            </div>
          </article>
        `).join("")}
      </div>
    `
    : "";

  analyticsListElement.innerHTML = `${cardsHtml}${sectionsHtml}`;
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
    renderUsage({});
    return;
  }

  const summary = payload.summary ?? {};
  renderSummary(summary);
  state.checks = Array.isArray(payload.checks) ? payload.checks : [];
  renderSelectedProcess();
  renderNotes(Array.isArray(payload.notes) ? payload.notes : []);
  const total = getSummaryTotal(summary);
  setStatus(`Estado actualizado: ${total} chequeos operativos · ${new Date(payload.generated_at).toLocaleString("es-AR")}`);
};

const getAccessToken = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData?.session?.access_token ?? "";
};

const replaceChecksByArea = (areas = [], checks = []) => {
  const metricAreas = new Set(areas);
  state.checks = state.checks
    .filter((check) => !metricAreas.has(check?.area))
    .concat(checks);
  renderSummary(summarizeChecks(state.checks));
  renderSelectedProcess();
};

const replaceSupabaseMetricChecks = (checks = []) => {
  replaceChecksByArea(["Supabase metricas", "Supabase uso del plan"], checks);
};

const replaceVercelAnalyticsChecks = (checks = []) => {
  replaceChecksByArea(["Vercel Analytics"], checks);
};

const loadSupabaseMetrics = async () => {
  if (!metricsRefreshButton) return;
  metricsRefreshButton.disabled = true;
  metricsRefreshButton.textContent = "Consultando...";
  if (metricsMetaElement) metricsMetaElement.textContent = "Consultando";
  if (usageMetaElement) usageMetaElement.textContent = "Consultando";

  try {
    const token = await getAccessToken();
    if (!token) {
      setStatus("Tenes que iniciar sesion para consultar Supabase.");
      return;
    }

    const response = await fetch("/api/admin/supabase-metrics", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      renderMetrics({
        check: {
          label: "Supabase",
          status: "error",
          detail: payload?.error ?? "No se pudieron cargar las mediciones.",
        },
      });
      renderUsage({});
      setStatus(payload?.error ?? "No se pudieron cargar las mediciones de Supabase.");
      return;
    }

    renderMetrics(payload.metrics ?? {});
    renderUsage(payload.usage ?? {});
    replaceSupabaseMetricChecks(Array.isArray(payload.checks) ? payload.checks : []);
    setStatus(`Mediciones Supabase actualizadas - ${new Date(payload.generated_at).toLocaleString("es-AR")}`);
  } catch {
    renderMetrics({
      check: {
        label: "Supabase",
        status: "error",
        detail: "No se pudieron cargar las mediciones.",
      },
    });
    renderUsage({});
    setStatus("No se pudieron cargar las mediciones de Supabase.");
  } finally {
    metricsRefreshButton.disabled = false;
    metricsRefreshButton.textContent = "Consultar";
  }
};

const loadVercelAnalytics = async () => {
  if (!analyticsRefreshButton) return;
  analyticsRefreshButton.disabled = true;
  analyticsRefreshButton.textContent = "Consultando...";
  if (analyticsMetaElement) analyticsMetaElement.textContent = "Consultando";

  try {
    const token = await getAccessToken();
    if (!token) {
      setStatus("Tenes que iniciar sesion para consultar Vercel Analytics.");
      return;
    }

    const response = await fetch("/api/admin/vercel-analytics", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      renderAnalytics({
        check: {
          label: "Vercel Analytics",
          status: "error",
          detail: payload?.error ?? "No se pudo cargar Vercel Analytics.",
        },
      });
      setStatus(payload?.error ?? "No se pudo cargar Vercel Analytics.");
      return;
    }

    renderAnalytics(payload.analytics ?? {});
    replaceVercelAnalyticsChecks(Array.isArray(payload.checks) ? payload.checks : []);
    setStatus(`Vercel Analytics actualizado - ${new Date(payload.generated_at).toLocaleString("es-AR")}`);
  } catch {
    renderAnalytics({
      check: {
        label: "Vercel Analytics",
        status: "error",
        detail: "No se pudo cargar Vercel Analytics.",
      },
    });
    setStatus("No se pudo cargar Vercel Analytics.");
  } finally {
    analyticsRefreshButton.disabled = false;
    analyticsRefreshButton.textContent = "Consultar";
  }
};

tabsElement?.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-admin-health-process]");
  if (!tab) return;
  state.selectedProcess = tab.getAttribute("data-admin-health-process") ?? "";
  renderSelectedProcess();
});

metricsRefreshButton?.addEventListener("click", () => {
  loadSupabaseMetrics();
});

analyticsRefreshButton?.addEventListener("click", () => {
  loadVercelAnalytics();
});

renderMetrics({
  pending: true,
  check: {
    label: "Consulta manual",
    status: "warning",
    detail: "Toca Consultar para leer Metrics API y uso del plan.",
  },
});
renderUsage({});
renderAnalytics({
  pending: true,
  check: {
    label: "Consulta manual",
    status: "warning",
    detail: "Toca Consultar para leer Vercel Web Analytics.",
  },
});

loadHealth().catch(() => {
  setStatus("No se pudo cargar el estado operativo.");
});
