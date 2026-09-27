import { jsonResponse } from "../../../lib/apiResponse.js";
import { requireAdmin } from "../../../lib/adminAuth.js";
import { summarizeMarketplaceFeeOrders } from "../../../lib/adminMarketplaceFee.js";
import { checkRateLimit } from "../../../lib/serverRateLimit.js";
import { getSupabaseAdmin } from "../../../lib/supabaseServer.js";

const ORDERS_SELECT = "id, created_at, status, payment_status, payment_id, preference_id, total_amount, currency, payment_detail";
const MAX_ORDERS = 1000;
const RECENT_LIMIT = 20;

const formatRecentOrder = (order) => ({
  id: order.id,
  created_at: order.created_at,
  status: order.status,
  payment_status: order.payment_status,
  payment_state: order.payment_state,
  payment_id: order.payment_id,
  preference_id: order.preference_id,
  total_amount: order.total_amount,
  currency: order.currency,
  marketplace_fee: order.marketplace_fee,
  fee_approved: order.fee_approved,
  mp_approved: order.mp_approved,
  mp_without_fee_trace: order.mp_without_fee_trace,
  has_fee_trace: order.has_fee_trace,
  has_mp_trace: order.has_mp_trace,
  mp_status_detail: order.mp_status_detail,
});

/** @type {import("astro").APIRoute} */
export const GET = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "admin-administracion",
      windowMs: 60_000,
      max: 60,
    });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas solicitudes. Intentá nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);

    const admin = await requireAdmin(supabaseAdmin, request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);

    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(ORDERS_SELECT)
      .order("created_at", { ascending: false })
      .limit(MAX_ORDERS);

    if (error) {
      return jsonResponse({ error: "No se pudo leer la información administrativa." }, 500);
    }

    const { orders, summary } = summarizeMarketplaceFeeOrders(data ?? []);
    const recent = orders
      .filter((order) => order.has_mp_trace || order.marketplace_fee > 0)
      .slice(0, RECENT_LIMIT)
      .map(formatRecentOrder);

    return jsonResponse({
      ok: true,
      generated_at: new Date().toISOString(),
      currency: recent[0]?.currency ?? "ARS",
      summary,
      recent,
    });
  } catch (error) {
    console.error("[admin-administracion] Unhandled error", error);
    return jsonResponse({ error: "No se pudo cargar la administración." }, 500);
  }
};
