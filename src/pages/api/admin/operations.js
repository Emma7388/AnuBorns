import { jsonResponse } from "../../../lib/apiResponse.js";
import { requireAdmin } from "../../../lib/adminAuth.js";
import { buildAdminOperationsSnapshot } from "../../../lib/adminOperations.js";
import { checkRateLimit } from "../../../lib/serverRateLimit.js";
import { getSupabaseAdmin } from "../../../lib/supabaseServer.js";

const MAX_ORDERS = 500;
const MAX_RELATED_ROWS = 1000;

/** @type {import("astro").APIRoute} */
export const GET = async ({ request }) => {
  try {
    const rate = await checkRateLimit({ request, routeKey: "admin-operations", windowMs: 60_000, max: 30 });
    if (!rate.allowed) return jsonResponse({ error: "Demasiadas solicitudes. Intentá nuevamente en un minuto." }, 429);

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);
    const admin = await requireAdmin(supabaseAdmin, request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);

    const [ordersResult, dispatchesResult, productsResult, auditResult] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id,created_at,status,payment_status,payment_id,preference_id,payment_detail,total_amount,currency,shipping_requested,shipping_status,order_items(product_id,name,qty,provider)")
        .order("created_at", { ascending: false })
        .limit(MAX_ORDERS),
      supabaseAdmin
        .from("sale_dispatches")
        .select("order_id,product_id,fulfillment_status,status_updated_at")
        .order("status_updated_at", { ascending: false })
        .limit(MAX_RELATED_ROWS),
      supabaseAdmin
        .from("products")
        .select("id,title,stock,publication_type,publication_status,publication_expires_at,created_at")
        .order("created_at", { ascending: false })
        .limit(MAX_RELATED_ROWS),
      supabaseAdmin
        .from("audit_logs")
        .select("event,metadata,created_at")
        .eq("event", "order_payment_status_changed")
        .order("created_at", { ascending: false })
        .limit(MAX_RELATED_ROWS),
    ]);

    const failed = [ordersResult, dispatchesResult, productsResult, auditResult].find((result) => result.error);
    if (failed?.error) {
      console.error("[admin-operations] query failed", failed.error.message);
      return jsonResponse({ error: "No se pudo construir el control global de operaciones." }, 500);
    }

    return jsonResponse({
      ok: true,
      generated_at: new Date().toISOString(),
      limits: { orders: MAX_ORDERS, related_rows: MAX_RELATED_ROWS },
      ...buildAdminOperationsSnapshot({
        orders: ordersResult.data ?? [],
        dispatches: dispatchesResult.data ?? [],
        products: productsResult.data ?? [],
        auditLogs: auditResult.data ?? [],
      }),
    });
  } catch (error) {
    console.error("[admin-operations] unhandled error", error?.message ?? error);
    return jsonResponse({ error: "No se pudo cargar el control global de operaciones." }, 500);
  }
};
