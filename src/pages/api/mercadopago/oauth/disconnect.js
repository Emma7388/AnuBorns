/* Desconecta la cuenta Mercado Pago OAuth del vendedor autenticado. */
import { getSupabaseAdmin } from "../../../../lib/supabaseServer.js";
import { jsonResponse } from "../../../../lib/apiResponse.js";
import { getAuthenticatedUser } from "../../../../lib/serverAuth.js";
import { checkRateLimit } from "../../../../lib/serverRateLimit.js";

/** @type {import("astro").APIRoute} */
export const POST = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "mp-oauth-disconnect",
      windowMs: 60_000,
      max: 20,
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

    const { error: deleteError } = await supabaseAdmin
      .from("seller_mercadopago_accounts")
      .delete()
      .eq("user_id", auth.user.id);

    if (deleteError) {
      console.error("[mp-oauth-disconnect] Account delete failed", { error: deleteError.message });
      return jsonResponse({ error: "No se pudo desconectar Mercado Pago." }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("[mp-oauth-disconnect] Unhandled error", error);
    return jsonResponse({ error: "No se pudo desconectar Mercado Pago." }, 500);
  }
};
