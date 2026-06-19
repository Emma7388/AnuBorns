/* Inicia OAuth para conectar la cuenta Mercado Pago de un vendedor. */
import { createMercadoPagoOAuthState } from "../../../../lib/mercadopagoOAuthState.js";
import { getSupabaseAdmin } from "../../../../lib/supabaseServer.js";
import { checkRateLimit } from "../../../../lib/serverRateLimit.js";

const clientId = process.env.MERCADOPAGO_CLIENT_ID;
const redirectUri = process.env.MERCADOPAGO_OAUTH_REDIRECT_URI;

/** @type {import("astro").APIRoute} */
export const POST = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "mp-oauth-connect",
      windowMs: 60_000,
      max: 20,
    });
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }), {
        status: 429,
      });
    }

    if (!clientId || !redirectUri) {
      return new Response(JSON.stringify({ error: "Falta configurar Mercado Pago OAuth." }), { status: 503 });
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

    const authUrl = new URL("https://auth.mercadopago.com/authorization");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("platform_id", "mp");
    authUrl.searchParams.set("state", createMercadoPagoOAuthState(userData.user.id));
    authUrl.searchParams.set("redirect_uri", redirectUri);

    return new Response(JSON.stringify({ authorization_url: authUrl.toString() }), { status: 200 });
  } catch (error) {
    console.error("[mp-oauth-connect] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudo iniciar la conexión con Mercado Pago." }), {
      status: 500,
    });
  }
};
