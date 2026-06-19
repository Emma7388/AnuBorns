/* Estado de conexión Mercado Pago del vendedor autenticado. */
import { getSupabaseAdmin } from "../../../../lib/supabaseServer.js";
import { checkRateLimit } from "../../../../lib/serverRateLimit.js";

/** @type {import("astro").APIRoute} */
export const GET = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "mp-oauth-status",
      windowMs: 60_000,
      max: 60,
    });
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }), {
        status: 429,
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ connected: false }), { status: 200 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ connected: false }), { status: 200 });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ connected: false }), { status: 200 });
    }

    const { data } = await supabaseAdmin
      .from("seller_mercadopago_accounts")
      .select("mp_user_id, connected_at, expires_at")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        connected: Boolean(data?.mp_user_id),
        connected_at: data?.connected_at ?? null,
        expires_at: data?.expires_at ?? null,
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("[mp-oauth-status] Unhandled error", error);
    return new Response(JSON.stringify({ connected: false }), { status: 200 });
  }
};
