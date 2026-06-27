/* Desconecta la cuenta Mercado Pago OAuth del vendedor autenticado. */
import { getSupabaseAdmin } from "../../../../lib/supabaseServer.js";
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

    const { error: deleteError } = await supabaseAdmin
      .from("seller_mercadopago_accounts")
      .delete()
      .eq("user_id", userData.user.id);

    if (deleteError) {
      console.error("[mp-oauth-disconnect] Account delete failed", { error: deleteError.message });
      return new Response(JSON.stringify({ error: "No se pudo desconectar Mercado Pago." }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error("[mp-oauth-disconnect] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudo desconectar Mercado Pago." }), { status: 500 });
  }
};
