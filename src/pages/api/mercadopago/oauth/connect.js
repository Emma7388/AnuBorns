/* Inicia OAuth para conectar la cuenta Mercado Pago de un vendedor. */
import { createMercadoPagoOAuthState } from "../../../../lib/mercadopagoOAuthState.js";
import { jsonResponse } from "../../../../lib/apiResponse.js";
import { getAuthenticatedUser } from "../../../../lib/serverAuth.js";
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
      return jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429);
    }

    if (!clientId || !redirectUri) {
      return jsonResponse({ error: "Falta configurar Mercado Pago OAuth." }, 503);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return jsonResponse({ error: "Servicio no disponible." }, 503);
    }

    const auth = await getAuthenticatedUser(supabaseAdmin, request);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const authUrl = new URL("https://auth.mercadopago.com/authorization");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("platform_id", "mp");
    authUrl.searchParams.set("state", createMercadoPagoOAuthState(auth.user.id));
    authUrl.searchParams.set("redirect_uri", redirectUri);

    return jsonResponse({ authorization_url: authUrl.toString() });
  } catch (error) {
    console.error("[mp-oauth-connect] Unhandled error", error);
    return jsonResponse({ error: "No se pudo iniciar la conexión con Mercado Pago." }, 500);
  }
};
