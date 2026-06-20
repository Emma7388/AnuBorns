/* API: cancela ordenes de checkout abandonadas del comprador autenticado. */
import { cancelAbandonedCheckoutOrders } from "../../lib/checkoutPendingOrders.js";
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
      return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }), {
        status: 429,
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ error: "Servicio no disponible." }), { status: 503 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado." }), { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sesion invalida." }), { status: 401 });
    }

    const result = await cancelAbandonedCheckoutOrders(supabaseAdmin, { userId: userData.user.id });
    if (!result.ok) {
      return new Response(JSON.stringify({ error: "No se pudieron limpiar las compras pendientes." }), {
        status: 500,
      });
    }

    return new Response(JSON.stringify({ ok: true, cancelled: result.count }), { status: 200 });
  } catch (error) {
    console.error("[checkout-pending-cleanup] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudieron limpiar las compras pendientes." }), { status: 500 });
  }
};
