import { jsonResponse } from "../../../lib/apiResponse.js";
import { requireAdmin } from "../../../lib/adminAuth.js";
import { summarizeHealth } from "../../../lib/adminHealth.js";
import { checkRateLimit } from "../../../lib/serverRateLimit.js";
import { getSupabaseAdmin } from "../../../lib/supabaseServer.js";
import { getVercelAnalyticsSnapshot } from "../../../lib/vercelAnalytics.js";

const metricToHealthCheck = (metric) => ({
  id: `vercel-${metric.id}`,
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
      routeKey: "admin-vercel-analytics",
      windowMs: 60_000,
      max: 20,
    });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas consultas. Intenta nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);

    const admin = await requireAdmin(supabaseAdmin, request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);

    const analytics = await getVercelAnalyticsSnapshot();
    const checks = [
      analytics.check,
      ...(Array.isArray(analytics.items) ? analytics.items : []).map(metricToHealthCheck),
    ].filter(Boolean);

    return jsonResponse({
      ok: true,
      generated_at: analytics.generated_at ?? new Date().toISOString(),
      summary: summarizeHealth(checks),
      checks,
      analytics,
    });
  } catch (error) {
    console.error("[admin-vercel-analytics] Unhandled error", error);
    return jsonResponse({ error: "No se pudo cargar la analitica de Vercel." }, 500);
  }
};
