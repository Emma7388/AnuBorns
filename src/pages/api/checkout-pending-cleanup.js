/* API: cancela ordenes de checkout abandonadas del comprador autenticado. */
import { cancelAbandonedCheckoutOrders } from "../../lib/checkoutPendingOrders.js";
import { jsonResponse } from "../../lib/apiResponse.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";

/** @type {import("astro").APIRoute} */
export const POST = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "checkout-pending-cleanup",
      windowMs: 60_000,
      max: 30,
    });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return jsonResponse({ error: "Servicio no disponible." }, 503);
    }

    const auth = await getAuthenticatedUser(supabaseAdmin, request);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const result = await cancelAbandonedCheckoutOrders(supabaseAdmin, { userId: auth.user.id });
    if (!result.ok) {
      return jsonResponse({ error: "No se pudieron limpiar las compras pendientes." }, 500);
    }

    return jsonResponse({ ok: true, cancelled: result.count });
  } catch (error) {
    console.error("[checkout-pending-cleanup] Unhandled error", error);
    return jsonResponse({ error: "No se pudieron limpiar las compras pendientes." }, 500);
  }
};
