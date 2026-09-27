import { getSupabaseAdminConfigStatus } from "./supabaseServer.js";

const METRICS_PATH = "/customer/v1/privileged/metrics";
const METRICS_TIMEOUT_MS = 8_000;
const BYTES_IN_MB = 1024 ** 2;
const BYTES_IN_GB = 1024 ** 3;
const STORAGE_PAGE_SIZE = 1_000;
const STORAGE_MAX_PAGES = 8;
const STORAGE_MAX_DEPTH = 5;
const AUTH_USERS_PAGE_SIZE = 1_000;
const AUTH_USERS_MAX_PAGES = 5;

const FREE_PLAN_LIMITS = {
  egressBytes: 5 * BYTES_IN_GB,
  databaseBytes: 500 * BYTES_IN_MB,
  monthlyActiveUsers: 50_000,
  fileStorageBytes: 1 * BYTES_IN_GB,
  logIngestionBytes: 1 * BYTES_IN_GB,
  logQueryBytes: 100 * BYTES_IN_GB,
};

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

const sumFirstAvailableMetric = (samples, names = []) => {
  for (const name of names) {
    const total = samples
      .filter((sample) => sample.name === name)
      .reduce((acc, sample) => acc + sample.value, 0);
    if (total > 0) return { name, value: total };
  }
  return { name: "", value: null };
};

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

const buildUsageMetric = ({
  id,
  label,
  used,
  limit,
  usedDisplay,
  limitDisplay,
  status,
  detail,
  source = "automatic",
  meta = {},
}) => {
  const resolvedStatus = status ?? (
    Number.isFinite(used) && Number.isFinite(limit) && limit > 0
      ? statusFromPercent((used / limit) * 100, 75, 90)
      : "warning"
  );
  return {
    id,
    area: "Supabase uso del plan",
    label,
    value: Number.isFinite(used) && Number.isFinite(limit) && limit > 0
      ? round((used / limit) * 100, 1)
      : null,
    unit: "%",
    value_display: Number.isFinite(used) && Number.isFinite(limit) && limit > 0
      ? `${usedDisplay} / ${limitDisplay}`
      : usedDisplay ?? "Sin dato",
    status: resolvedStatus,
    detail,
    source,
    meta: { used, limit, source, ...meta },
  };
};

const getDatabaseSizeBytesFromSamples = (samples = []) => {
  const fromBytes = sumFirstAvailableMetric(samples, [
    "pg_database_size_bytes",
    "postgresql_database_size_bytes",
    "postgres_database_size_bytes",
  ]);
  if (Number.isFinite(fromBytes.value)) return fromBytes;

  const fromMb = sumFirstAvailableMetric(samples, [
    "pg_database_size_mb",
    "postgresql_database_size_mb",
    "postgres_database_size_mb",
  ]);
  if (Number.isFinite(fromMb.value)) {
    return { name: fromMb.name, value: fromMb.value * BYTES_IN_MB };
  }

  return { name: "", value: null };
};

const monthStartIso = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

const getMonthlyActiveUsers = async (supabaseAdmin) => {
  if (!supabaseAdmin?.auth?.admin?.listUsers) {
    return { ok: false, count: null, source: "auth", error: "Administrador de autenticacion no disponible." };
  }

  const since = monthStartIso();
  let page = 1;
  let active = 0;

  while (page <= AUTH_USERS_MAX_PAGES) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PAGE_SIZE,
    });
    if (error) {
      return { ok: false, count: null, source: "auth", error: error.message };
    }

    const users = Array.isArray(data?.users) ? data.users : [];
    active += users.filter((user) => {
      const lastSeen = user.last_sign_in_at ?? user.updated_at ?? user.created_at;
      return lastSeen && lastSeen >= since;
    }).length;

    if (users.length < AUTH_USERS_PAGE_SIZE) {
      return { ok: true, count: active, source: "auth", truncated: false };
    }
    page += 1;
  }

  return { ok: true, count: active, source: "auth", truncated: true };
};

const getFileStorageBytes = async (supabaseAdmin) => {
  if (!supabaseAdmin?.storage?.listBuckets) {
    return { ok: false, bytes: null, source: "storage-api", error: "API de Storage no disponible." };
  }

  let objectCount = 0;
  let truncated = false;

  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) {
    return { ok: false, bytes: null, source: "storage-api", error: error.message };
  }

  const readPath = async (bucketId, path = "", depth = 0) => {
    if (depth > STORAGE_MAX_DEPTH) {
      truncated = true;
      return 0;
    }

    let page = 0;
    let total = 0;
    while (page < STORAGE_MAX_PAGES) {
      const offset = page * STORAGE_PAGE_SIZE;
      const { data, error: listError } = await supabaseAdmin.storage
        .from(bucketId)
        .list(path, {
          limit: STORAGE_PAGE_SIZE,
          offset,
        });

      if (listError) throw listError;

      const rows = Array.isArray(data) ? data : [];
      for (const row of rows) {
        const name = String(row?.name ?? "").trim();
        if (!name || name === ".emptyFolderPlaceholder") continue;

        const size = Number(row?.metadata?.size ?? 0);
        if (Number.isFinite(size) && size > 0) {
          total += size;
          objectCount += 1;
          continue;
        }

        const childPath = path ? `${path}/${name}` : name;
        total += await readPath(bucketId, childPath, depth + 1);
      }

      if (rows.length < STORAGE_PAGE_SIZE) return total;
      page += 1;
    }

    truncated = true;
    return total;
  };

  try {
    let total = 0;
    for (const bucket of Array.isArray(buckets) ? buckets : []) {
      const bucketId = String(bucket?.id ?? bucket?.name ?? "").trim();
      if (!bucketId) continue;
      total += await readPath(bucketId);
    }

    return { ok: true, bytes: total, source: "storage-api", objectCount, truncated };
  } catch (listError) {
    return { ok: false, bytes: null, source: "storage-api", error: listError.message };
  }
};

const buildUsageUnavailable = ({ id, label, limitDisplay, detail }) => ({
  id,
  label,
  limit_display: limitDisplay,
  detail,
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
    raw: {
      databaseSizeBytes: getDatabaseSizeBytesFromSamples(samples),
    },
    summary: {
      ok: items.filter((item) => item.status === "ok").length,
      warnings: items.filter((item) => item.status === "warning").length,
      errors: items.filter((item) => item.status === "error").length,
    },
  };
};

export const buildSupabasePlanUsageSnapshot = async ({
  supabaseAdmin,
  metrics = {},
} = {}) => {
  const databaseSize = metrics?.raw?.databaseSizeBytes ?? { value: null, name: "" };
  const storage = await getFileStorageBytes(supabaseAdmin);
  const mau = await getMonthlyActiveUsers(supabaseAdmin);

  const items = [];
  const unavailable = [
    buildUsageUnavailable({
      id: "usage-egress",
      label: "Egreso",
      limitDisplay: "5 GB",
      detail: "Supabase lo muestra en Uso/Facturacion; no viene en la API de metricas como lectura liviana.",
    }),
    buildUsageUnavailable({
      id: "usage-log-ingestion",
      label: "Ingreso de logs",
      limitDisplay: "1 GB",
      detail: "Supabase lo calcula desde sus servicios internos y lo muestra en Uso.",
    }),
    buildUsageUnavailable({
      id: "usage-log-query",
      label: "Consulta de logs",
      limitDisplay: "100 GB",
      detail: "No lo consultamos desde la app para no gastar el mismo cupo que queremos vigilar.",
    }),
  ];

  if (Number.isFinite(databaseSize.value)) {
    items.push(buildUsageMetric({
      id: "usage-database-size",
      label: "Tamaño de base de datos",
      used: databaseSize.value,
      limit: FREE_PLAN_LIMITS.databaseBytes,
      usedDisplay: Number.isFinite(databaseSize.value) ? bytesToDisplay(databaseSize.value) : "Sin dato",
      limitDisplay: "500 MB",
      detail: Number.isFinite(databaseSize.value)
        ? `Lectura desde ${databaseSize.name}.`
        : "No vino una metrica de database size.",
      source: databaseSize.name ? "metrics" : "dashboard",
    }));
  } else {
    unavailable.push(buildUsageUnavailable({
      id: "usage-database-size",
      label: "Tamaño de base de datos",
      limitDisplay: "500 MB",
      detail: "No vino en esta lectura de la API de metricas; revisar el valor exacto en Uso de Supabase.",
    }));
  }

  if (mau.ok && Number.isFinite(mau.count)) {
    items.push(buildUsageMetric({
      id: "usage-monthly-active-users",
      label: "Usuarios activos del mes",
      used: mau.count,
      limit: FREE_PLAN_LIMITS.monthlyActiveUsers,
      usedDisplay: Number.isFinite(mau.count) ? String(round(mau.count, 0)) : "Sin dato",
      limitDisplay: "50.000",
      detail: mau.ok
        ? `Aproximado desde autenticacion desde el inicio del mes${mau.truncated ? "; lectura truncada" : ""}.`
        : `No se pudo leer autenticacion: ${mau.error}`,
      source: mau.source,
    }));
  } else {
    unavailable.push(buildUsageUnavailable({
      id: "usage-monthly-active-users",
      label: "Usuarios activos del mes",
      limitDisplay: "50.000",
      detail: mau.error ?? "No se pudo leer autenticacion en esta consulta.",
    }));
  }

  if (storage.ok && Number.isFinite(storage.bytes)) {
    items.push(buildUsageMetric({
      id: "usage-file-storage",
      label: "Archivos almacenados",
      used: storage.bytes,
      limit: FREE_PLAN_LIMITS.fileStorageBytes,
      usedDisplay: Number.isFinite(storage.bytes) ? bytesToDisplay(storage.bytes) : "Sin dato",
      limitDisplay: "1 GB",
      detail: storage.ok
        ? `Suma aproximada de objetos en Storage${storage.truncated ? "; lectura truncada" : ""}.`
        : `No se pudo leer la API de Storage: ${storage.error}`,
      source: storage.source,
      meta: { objectCount: storage.objectCount ?? null },
    }));
  } else {
    unavailable.push(buildUsageUnavailable({
      id: "usage-file-storage",
      label: "Archivos almacenados",
      limitDisplay: "1 GB",
      detail: storage.error ?? "No se pudo leer Storage en esta consulta.",
    }));
  }

  return {
    configured: true,
    plan: "Free",
    generated_at: new Date().toISOString(),
    items,
    unavailable,
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
        label: "API de metricas",
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
          label: "API de metricas",
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
      label: "API de metricas",
      status: "ok",
      detail: `Lectura correcta desde la API de metricas: ${snapshot.sampled_metrics} muestras.`,
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
        label: "API de metricas",
        status: "error",
        detail: aborted
          ? "La lectura de metricas excedio el tiempo maximo."
          : "No se pudo conectar con la API de metricas.",
        action: "Revisar conectividad, project ref y clave de metricas.",
        meta: { error: String(error?.message ?? error) },
      },
    };
  } finally {
    clearTimeout(timeout);
  }
};
