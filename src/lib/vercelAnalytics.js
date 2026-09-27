import { buildHealthCheck } from "./adminHealth.js";

const VERCEL_WEB_ANALYTICS_BASE = "https://api.vercel.com/v1/query/web-analytics";
const VERCEL_ANALYTICS_TIMEOUT_MS = 8_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

const getEnvValue = (key) => {
  const env = import.meta.env ?? {};
  return process.env[key] ?? env[key] ?? "";
};

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatNumber = (value) =>
  new Intl.NumberFormat("es-AR").format(Number.isFinite(value) ? value : 0);

const formatDateRange = (since, until) => {
  const from = new Date(since);
  const to = new Date(until);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "";
  return `${from.toLocaleDateString("es-AR")} a ${to.toLocaleDateString("es-AR")}`;
};

const getNestedCandidates = (payload = {}) => [
  payload,
  payload.data,
  payload.result,
  payload.analytics,
  payload.totals,
].filter((item) => item && typeof item === "object");

export const normalizeVercelAnalyticsCount = (payload = {}) => {
  const candidates = getNestedCandidates(payload);
  const findNumber = (keys) => {
    for (const candidate of candidates) {
      for (const key of keys) {
        const value = toFiniteNumber(candidate[key]);
        if (value !== null) return value;
      }
    }
    return 0;
  };

  return {
    visitors: findNumber(["visitors", "visitorsCount", "uniqueVisitors", "users"]),
    pageviews: findNumber(["pageviews", "pageViews", "views", "count", "total"]),
  };
};

const getRowsCandidate = (payload = {}) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.result)) return payload.result;
  if (Array.isArray(payload.data?.rows)) return payload.data.rows;
  if (Array.isArray(payload.data?.items)) return payload.data.items;
  if (Array.isArray(payload.analytics?.data)) return payload.analytics.data;
  return [];
};

export const normalizeVercelAnalyticsRows = (payload = {}, dimensionKey = "") =>
  getRowsCandidate(payload)
    .map((row) => {
      const label = String(
        row?.[dimensionKey] ??
          row?.key ??
          row?.name ??
          row?.value ??
          row?.label ??
          row?.dimension ??
          "Sin dato",
      ).trim() || "Sin dato";
      const pageviews = toFiniteNumber(row?.pageviews ?? row?.pageViews ?? row?.views ?? row?.count ?? row?.total) ?? 0;
      const visitors = toFiniteNumber(row?.visitors ?? row?.uniqueVisitors ?? row?.users) ?? 0;
      return { label, pageviews, visitors };
    })
    .filter((row) => row.pageviews > 0 || row.visitors > 0)
    .sort((a, b) => (b.pageviews + b.visitors) - (a.pageviews + a.visitors));

export const getVercelAnalyticsConfig = () => {
  const token = String(
    getEnvValue("VERCEL_ANALYTICS_TOKEN") ||
      getEnvValue("VERCEL_TOKEN") ||
      "",
  ).trim();
  const projectId = String(
    getEnvValue("VERCEL_ANALYTICS_PROJECT_ID") ||
      getEnvValue("VERCEL_PROJECT_ID") ||
      "",
  ).trim();
  const teamId = String(getEnvValue("VERCEL_ANALYTICS_TEAM_ID") ?? "").trim();

  const missing = [];
  if (!token) missing.push("VERCEL_ANALYTICS_TOKEN");
  if (!projectId) missing.push("VERCEL_ANALYTICS_PROJECT_ID");

  return {
    configured: missing.length === 0,
    missing,
    projectId,
    teamId,
    token,
  };
};

const queryVercelAnalytics = async (path, params, config) => {
  const url = new URL(`${VERCEL_WEB_ANALYTICS_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  url.searchParams.set("projectId", config.projectId);
  if (config.teamId) url.searchParams.set("teamId", config.teamId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERCEL_ANALYTICS_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof body?.error?.message === "string"
        ? body.error.message
        : `Vercel respondio ${response.status}.`;
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
};

const buildMetric = ({ id, label, value, status = "ok", detail, meta = {} }) => ({
  id,
  area: "Vercel Analytics",
  label,
  value,
  value_display: value,
  status,
  detail,
  meta,
});

const buildSection = ({ id, label, rows, empty }) => ({
  id,
  label,
  rows: rows.slice(0, 5),
  empty,
});

export const buildVercelAnalyticsSnapshot = ({
  count7d = {},
  count30d = {},
  pages = [],
  referrers = [],
  countries = [],
  devices = [],
  generatedAt = new Date().toISOString(),
  range7d = {},
  range30d = {},
} = {}) => {
  const last7 = normalizeVercelAnalyticsCount(count7d);
  const last30 = normalizeVercelAnalyticsCount(count30d);
  const topPages = normalizeVercelAnalyticsRows(pages, "requestPath");
  const topReferrers = normalizeVercelAnalyticsRows(referrers, "referrerHostname");
  const topCountries = normalizeVercelAnalyticsRows(countries, "country");
  const topDevices = normalizeVercelAnalyticsRows(devices, "deviceType");
  const range7Text = formatDateRange(range7d.since, range7d.until) || "ultimos 7 dias";
  const range30Text = formatDateRange(range30d.since, range30d.until) || "ultimos 30 dias";

  const items = [
    buildMetric({
      id: "vercel-visitors-7d",
      label: "Visitantes 7 dias",
      value: formatNumber(last7.visitors),
      detail: `Rango ${range7Text}.`,
      meta: { raw: last7.visitors },
    }),
    buildMetric({
      id: "vercel-pageviews-7d",
      label: "Page views 7 dias",
      value: formatNumber(last7.pageviews),
      detail: `Rango ${range7Text}.`,
      meta: { raw: last7.pageviews },
    }),
    buildMetric({
      id: "vercel-visitors-30d",
      label: "Visitantes 30 dias",
      value: formatNumber(last30.visitors),
      detail: `Rango ${range30Text}.`,
      meta: { raw: last30.visitors },
    }),
    buildMetric({
      id: "vercel-pageviews-30d",
      label: "Page views 30 dias",
      value: formatNumber(last30.pageviews),
      detail: `Rango ${range30Text}.`,
      meta: { raw: last30.pageviews },
    }),
  ];

  const firstPage = topPages[0];
  const firstReferrer = topReferrers[0];
  if (firstPage) {
    items.push(buildMetric({
      id: "vercel-top-page",
      label: "Pagina principal",
      value: firstPage.label,
      detail: `${formatNumber(firstPage.pageviews)} page views en 30 dias.`,
      meta: firstPage,
    }));
  }
  if (firstReferrer) {
    items.push(buildMetric({
      id: "vercel-top-referrer",
      label: "Origen principal",
      value: firstReferrer.label,
      detail: `${formatNumber(firstReferrer.pageviews)} page views referidas.`,
      meta: firstReferrer,
    }));
  }

  const sections = [
    buildSection({
      id: "top-pages",
      label: "Paginas mas vistas",
      rows: topPages,
      empty: "Sin paginas registradas en el rango.",
    }),
    buildSection({
      id: "top-referrers",
      label: "Origenes",
      rows: topReferrers,
      empty: "Sin origenes registrados en el rango.",
    }),
    buildSection({
      id: "top-countries",
      label: "Paises",
      rows: topCountries,
      empty: "Sin paises registrados en el rango.",
    }),
    buildSection({
      id: "top-devices",
      label: "Dispositivos",
      rows: topDevices,
      empty: "Sin dispositivos registrados en el rango.",
    }),
  ];

  return {
    configured: true,
    generated_at: generatedAt,
    items,
    sections,
    check: buildHealthCheck({
      id: "vercel-analytics-api",
      area: "Vercel Analytics",
      label: "Web Analytics API",
      status: "ok",
      detail: "Lectura manual OK desde Vercel Web Analytics.",
    }),
  };
};

export const getVercelAnalyticsSnapshot = async () => {
  const config = getVercelAnalyticsConfig();
  if (!config.configured) {
    return {
      configured: false,
      generated_at: new Date().toISOString(),
      items: [],
      sections: [],
      check: buildHealthCheck({
        id: "vercel-analytics-api",
        area: "Vercel Analytics",
        label: "Web Analytics API",
        status: "warning",
        detail: "El panel esta listo, pero faltan variables privadas de Vercel.",
        action: `Configurar ${config.missing.join(" y ")} en Vercel/local.`,
        meta: { missing: config.missing },
      }),
    };
  }

  const now = new Date();
  const until = now.toISOString();
  const since7d = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const since30d = new Date(now.getTime() - 30 * DAY_MS).toISOString();

  try {
    const [count7d, count30d, pages, referrers, countries, devices] = await Promise.all([
      queryVercelAnalytics("/visits/count", { since: since7d, until }, config),
      queryVercelAnalytics("/visits/count", { since: since30d, until }, config),
      queryVercelAnalytics("/visits/aggregate", { since: since30d, until, by: "requestPath", limit: 5 }, config),
      queryVercelAnalytics("/visits/aggregate", { since: since30d, until, by: "referrerHostname", limit: 5 }, config),
      queryVercelAnalytics("/visits/aggregate", { since: since30d, until, by: "country", limit: 5 }, config),
      queryVercelAnalytics("/visits/aggregate", { since: since30d, until, by: "deviceType", limit: 5 }, config),
    ]);

    return buildVercelAnalyticsSnapshot({
      count7d,
      count30d,
      pages,
      referrers,
      countries,
      devices,
      generatedAt: until,
      range7d: { since: since7d, until },
      range30d: { since: since30d, until },
    });
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return {
      configured: true,
      generated_at: new Date().toISOString(),
      items: [],
      sections: [],
      check: buildHealthCheck({
        id: "vercel-analytics-api",
        area: "Vercel Analytics",
        label: "Web Analytics API",
        status: "error",
        detail: aborted
          ? "La lectura de Vercel Analytics excedio el tiempo maximo."
          : "No se pudo consultar Vercel Analytics.",
        action: "Revisar VERCEL_ANALYTICS_TOKEN, project id y permisos del token.",
        meta: { error: String(error?.message ?? error), status: error?.status ?? null },
      }),
    };
  }
};
