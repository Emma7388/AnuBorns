import { getSupabaseAdminConfigStatus } from "./supabaseServer.js";

const METRICS_PATH = "/customer/v1/privileged/metrics";
const METRICS_TIMEOUT_MS = 8_000;

const getEnvValue = (key) => {
  const env = import.meta.env ?? {};
  return process.env[key] ?? env[key] ?? "";
};

const round = (value, decimals = 1) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const clampPercent = (value) => {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
};

const bytesToDisplay = (bytes) => {
  if (!Number.isFinite(bytes)) return "Sin dato";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.abs(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const signed = bytes < 0 ? -value : value;
  return `${round(signed, unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const deriveSupabaseProjectRef = (supabaseUrl = "") => {
  const explicit = String(getEnvValue("SUPABASE_PROJECT_REF") ?? "").trim();
  if (explicit) return explicit;

  try {
    const hostname = new URL(supabaseUrl).hostname;
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
};

export const getSupabaseMetricsConfig = () => {
  const { supabaseUrl } = getSupabaseAdminConfigStatus();
  const projectRef = deriveSupabaseProjectRef(supabaseUrl);
  const secretKey = String(
    getEnvValue("SUPABASE_METRICS_SECRET_KEY") ||
      getEnvValue("SUPABASE_SECRET_KEY") ||
      "",
  ).trim();

  const missing = [];
  if (!projectRef) missing.push("SUPABASE_PROJECT_REF");
  if (!secretKey) missing.push("SUPABASE_METRICS_SECRET_KEY");

  return {
    configured: missing.length === 0,
    endpoint: projectRef ? `https://${projectRef}.supabase.co${METRICS_PATH}` : "",
    missing,
    projectRef,
    secretKey,
  };
};

const parseLabels = (raw = "") => {
  const labels = {};
  let key = "";
  let value = "";
  let readingValue = false;
  let inQuotes = false;
  let escaping = false;

  const commit = () => {
    const cleanKey = key.trim();
    if (cleanKey) labels[cleanKey] = value;
    key = "";
    value = "";
    readingValue = false;
  };

  for (const char of raw) {
    if (escaping) {
      value += char;
      escaping = false;
      continue;
    }
    if (readingValue && inQuotes && char === "\\") {
      escaping = true;
      continue;
    }
    if (readingValue && char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === "=") {
      readingValue = true;
      continue;
    }
    if (!inQuotes && char === ",") {
      commit();
      continue;
    }
    if (readingValue) {
      value += char;
    } else {
      key += char;
    }
  }
  commit();
  return labels;
};

export const parsePrometheusMetrics = (text = "") => {
  const samples = [];
  const linePattern =
    /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|NaN|\+?Inf|-Inf)(?:\s+\d+)?$/;

  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(linePattern);
    if (!match) continue;
    const rawValue = Number(match[3].replace("+Inf", "Infinity").replace("-Inf", "-Infinity"));
    if (!Number.isFinite(rawValue)) continue;
    samples.push({
      name: match[1],
      labels: parseLabels(match[2] ?? ""),
      value: rawValue,
    });
  }

  return samples;
};

const labelsMatch = (labels = {}, expected = {}) =>
  Object.entries(expected).every(([key, value]) => labels[key] === value);

const findSample = (samples, name, labels = {}) =>
  samples.find((sample) => sample.name === name && labelsMatch(sample.labels, labels));

const sumSamples = (samples, name, labels = {}) =>
  samples
    .filter((sample) => sample.name === name && labelsMatch(sample.labels, labels))
    .reduce((total, sample) => total + sample.value, 0);

const countCpuCores = (samples) => {
  const cpus = new Set(
    samples
      .filter((sample) => sample.name === "node_cpu_seconds_total" && sample.labels.service_type === "db")
      .map((sample) => sample.labels.cpu)
      .filter(Boolean),
  );
  return cpus.size || null;
};

const statusFromPercent = (percent, warningAt, errorAt) => {
  if (!Number.isFinite(percent)) return "warning";
  if (percent >= errorAt) return "error";
  if (percent >= warningAt) return "warning";
  return "ok";
};

const buildMetric = ({ id, area, label, value, unit = "", status = "ok", detail, meta = {} }) => ({
  id,
  area,
  label,
  value,
  unit,
  value_display: unit === "bytes" ? bytesToDisplay(value) : `${value}${unit}`,
  status,
  detail,
  meta,
});

export const buildSupabaseMetricsSnapshot = (samples = [], { projectRef = "" } = {}) => {
  const memoryTotal = findSample(samples, "node_memory_MemTotal_bytes", { service_type: "db" })?.value;
  const memoryAvailable = findSample(samples, "node_memory_MemAvailable_bytes", { service_type: "db" })?.value;
  const memoryUsedPercent = clampPercent(((memoryTotal - memoryAvailable) / memoryTotal) * 100);

  const swapTotal = findSample(samples, "node_memory_SwapTotal_bytes", { service_type: "db" })?.value;
  const swapFree = findSample(samples, "node_memory_SwapFree_bytes", { service_type: "db" })?.value;
  const swapUsed = Number.isFinite(swapTotal) && Number.isFinite(swapFree) ? Math.max(0, swapTotal - swapFree) : null;
  const swapUsedPercent = Number.isFinite(swapUsed) && swapTotal > 0 ? clampPercent((swapUsed / swapTotal) * 100) : 0;

  const diskSize = findSample(samples, "node_filesystem_size_bytes", {
    service_type: "db",
    mountpoint: "/",
  })?.value;
  const diskAvailable = findSample(samples, "node_filesystem_avail_bytes", {
    service_type: "db",
    mountpoint: "/",
  })?.value;
  const diskUsed = Number.isFinite(diskSize) && Number.isFinite(diskAvailable) ? Math.max(0, diskSize - diskAvailable) : null;
  const diskUsedPercent = Number.isFinite(diskUsed) && diskSize > 0 ? clampPercent((diskUsed / diskSize) * 100) : null;

  const cpuCores = countCpuCores(samples);
  const load5 = findSample(samples, "node_load5", { service_type: "db" })?.value;
  const loadStatus = Number.isFinite(load5) && cpuCores
    ? load5 >= cpuCores ? "error" : load5 >= cpuCores * 0.8 ? "warning" : "ok"
    : "warning";

  const diskIoNow = sumSamples(samples, "node_disk_io_now", { service_type: "db" });
  const openDbConnections = sumSamples(samples, "db_sql_connection_open");
  const dbConnectionWaits = sumSamples(samples, "db_sql_connection_wait_total");
  const postgresRestarts = findSample(samples, "postgresql_restarts_total", { service_type: "db" })?.value ?? 0;

  const items = [
    buildMetric({
      id: "memory-used",
      area: "Supabase metricas",
      label: "Memoria usada",
      value: round(memoryUsedPercent ?? 0),
      unit: "%",
      status: statusFromPercent(memoryUsedPercent, 80, 90),
      detail: Number.isFinite(memoryUsedPercent)
        ? `${bytesToDisplay(memoryAvailable)} libres de ${bytesToDisplay(memoryTotal)}.`
        : "Supabase no devolvio memoria disponible en esta muestra.",
      meta: { memoryTotal, memoryAvailable },
    }),
    buildMetric({
      id: "swap-used",
      area: "Supabase metricas",
      label: "Swap usado",
      value: round(swapUsedPercent ?? 0),
      unit: "%",
      status: swapUsedPercent >= 25 ? "error" : swapUsedPercent > 0 ? "warning" : "ok",
      detail: Number.isFinite(swapUsed)
        ? `${bytesToDisplay(swapUsed)} en swap. Si se mantiene arriba de 0, hay presion de memoria.`
        : "Supabase no devolvio datos de swap en esta muestra.",
      meta: { swapTotal, swapFree, swapUsed },
    }),
    buildMetric({
      id: "disk-used",
      area: "Supabase metricas",
      label: "Disco usado",
      value: round(diskUsedPercent ?? 0),
      unit: "%",
      status: statusFromPercent(diskUsedPercent, 75, 90),
      detail: Number.isFinite(diskUsed)
        ? `${bytesToDisplay(diskUsed)} usados de ${bytesToDisplay(diskSize)}.`
        : "Supabase no devolvio uso del filesystem principal.",
      meta: { diskSize, diskAvailable, diskUsed },
    }),
    buildMetric({
      id: "load-5m",
      area: "Supabase metricas",
      label: "Carga 5 min",
      value: round(load5 ?? 0, 2),
      status: loadStatus,
      detail: cpuCores
        ? `Referencia aproximada: ${cpuCores} vCPU detectadas.`
        : "No se pudo detectar cantidad de vCPU desde la muestra.",
      meta: { cpuCores, load5 },
    }),
    buildMetric({
      id: "disk-io-now",
      area: "Supabase metricas",
      label: "I/O en curso",
      value: round(diskIoNow, 0),
      status: diskIoNow >= 8 ? "warning" : "ok",
      detail: "Operaciones de disco actualmente en progreso.",
      meta: { diskIoNow },
    }),
    buildMetric({
      id: "db-open-connections",
      area: "Supabase metricas",
      label: "Conexiones abiertas",
      value: round(openDbConnections, 0),
      status: dbConnectionWaits > 0 ? "warning" : "ok",
      detail: dbConnectionWaits > 0
        ? "Hubo esperas acumuladas por conexiones en servicios internos."
        : "Conexiones reportadas por los servicios medidos.",
      meta: { openDbConnections, dbConnectionWaits },
    }),
    buildMetric({
      id: "postgres-restarts",
      area: "Supabase metricas",
      label: "Reinicios Postgres",
      value: round(postgresRestarts, 0),
      status: postgresRestarts > 0 ? "warning" : "ok",
      detail: "Contador reportado por Supabase para el proceso Postgres.",
      meta: { postgresRestarts },
    }),
  ];

  return {
    configured: true,
    project_ref: projectRef,
    sampled_metrics: samples.length,
    items,
    summary: {
      ok: items.filter((item) => item.status === "ok").length,
      warnings: items.filter((item) => item.status === "warning").length,
      errors: items.filter((item) => item.status === "error").length,
    },
  };
};

export const getSupabaseMetricsSnapshot = async () => {
  const config = getSupabaseMetricsConfig();
  if (!config.configured) {
    return {
      configured: false,
      project_ref: config.projectRef,
      sampled_metrics: 0,
      items: [],
      summary: { ok: 0, warnings: 1, errors: 0 },
      check: {
        id: "supabase-metrics-api",
        area: "Supabase metricas",
        label: "Metrics API",
        status: "warning",
        detail: "El panel de mediciones esta disponible, pero falta configurar la clave server-side.",
        action: `Configurar ${config.missing.join(" y ")} en Vercel/local.`,
        meta: { missing: config.missing },
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), METRICS_TIMEOUT_MS);

  try {
    const response = await fetch(config.endpoint, {
      headers: {
        Authorization: `Basic ${Buffer.from(`user:${config.secretKey}`).toString("base64")}`,
      },
      signal: controller.signal,
    });
    const body = await response.text();

    if (!response.ok) {
      return {
        configured: true,
        project_ref: config.projectRef,
        sampled_metrics: 0,
        items: [],
        summary: { ok: 0, warnings: 0, errors: 1 },
        check: {
          id: "supabase-metrics-api",
          area: "Supabase metricas",
          label: "Metrics API",
          status: "error",
          detail: `Supabase respondio ${response.status} al leer metricas.`,
          action: "Revisar SUPABASE_METRICS_SECRET_KEY y el project ref.",
          meta: { status: response.status, body: body.slice(0, 180) },
        },
      };
    }

    const snapshot = buildSupabaseMetricsSnapshot(parsePrometheusMetrics(body), {
      projectRef: config.projectRef,
    });
    snapshot.check = {
      id: "supabase-metrics-api",
      area: "Supabase metricas",
      label: "Metrics API",
      status: "ok",
      detail: `Lectura OK desde Metrics API: ${snapshot.sampled_metrics} muestras.`,
      meta: { projectRef: config.projectRef },
    };
    return snapshot;
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return {
      configured: true,
      project_ref: config.projectRef,
      sampled_metrics: 0,
      items: [],
      summary: { ok: 0, warnings: 0, errors: 1 },
      check: {
        id: "supabase-metrics-api",
        area: "Supabase metricas",
        label: "Metrics API",
        status: "error",
        detail: aborted
          ? "La lectura de metricas excedio el tiempo maximo."
          : "No se pudo conectar con Metrics API.",
        action: "Revisar conectividad, project ref y clave de metricas.",
        meta: { error: String(error?.message ?? error) },
      },
    };
  } finally {
    clearTimeout(timeout);
  }
};
