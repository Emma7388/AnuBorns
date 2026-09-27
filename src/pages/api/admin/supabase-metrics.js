import { jsonResponse } from "../../../lib/apiResponse.js";
import { requireAdmin } from "../../../lib/adminAuth.js";
import { buildHealthCheck, summarizeHealth } from "../../../lib/adminHealth.js";
import { checkRateLimit } from "../../../lib/serverRateLimit.js";
import { getSupabaseAdmin } from "../../../lib/supabaseServer.js";
import {
  buildSupabasePlanUsageSnapshot,
  getSupabaseMetricsSnapshot,
} from "../../../lib/supabaseMetrics.js";

const metricToHealthCheck = (metric, prefix = "metric") => buildHealthCheck({
  id: `${prefix}-${metric.id}`,
  area: metric.area,
  label: metric.label,
  status: metric.status,
  detail: `${metric.value_display}. ${metric.detail}`,
  meta: metric.meta,
});

/** @type {import("astro").APIRoute} */
export const GET = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "admin-supabase-metrics",
      windowMs: 60_000,
      max: 12,
    });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas consultas. Intenta nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);

    const admin = await requireAdmin(supabaseAdmin, request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);

    const metrics = await getSupabaseMetricsSnapshot();
    const usage = await buildSupabasePlanUsageSnapshot({ supabaseAdmin, metrics });
    const checks = [
      metrics.check,
      ...(Array.isArray(metrics.items) ? metrics.items : []).map((metric) => metricToHealthCheck(metric)),
      ...(Array.isArray(usage.items) ? usage.items : []).map((metric) => metricToHealthCheck(metric, "usage")),
    ].filter(Boolean);

    return jsonResponse({
      ok: true,
      generated_at: new Date().toISOString(),
      summary: summarizeHealth(checks),
      checks,
      metrics,
      usage,
    });
  } catch (error) {
    console.error("[admin-supabase-metrics] Unhandled error", error);
    return jsonResponse({ error: "No se pudieron cargar las mediciones de Supabase." }, 500);
  }
};
