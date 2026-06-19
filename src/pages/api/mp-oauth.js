/* Callback OAuth corto de Mercado Pago. */
import { verifyMercadoPagoOAuthState } from "../../lib/mercadopagoOAuthState.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";

const clientId = process.env.MERCADOPAGO_CLIENT_ID;
const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET;
const redirectUri = process.env.MERCADOPAGO_OAUTH_REDIRECT_URI;

const redirectToProducts = (request, status) => {
  const url = new URL("/vender/productos", request.url);
  url.searchParams.set("mp_oauth", status);
  return Response.redirect(url.toString(), 302);
};

const exchangeCodeForToken = async (code) => {
  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      test_token: "false",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: String(payload?.message ?? payload?.error ?? "No se pudo conectar Mercado Pago."),
    };
  }
  return { ok: true, payload };
};

export const GET = async ({ request }) => {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error) {
    return redirectToProducts(request, "rejected");
  }

  if (!clientId || !clientSecret || !redirectUri) {
    return redirectToProducts(request, "config_error");
  }

  if (!code || !state) {
    return new Response("Mercado Pago OAuth callback activo.", { status: 200 });
  }

  const stateResult = verifyMercadoPagoOAuthState(state);
  if (!stateResult.ok) {
    return redirectToProducts(request, "invalid_state");
  }

  const tokenResult = await exchangeCodeForToken(code);
  if (!tokenResult.ok) {
    console.error("[mp-oauth] Token exchange failed", { error: tokenResult.error });
    return redirectToProducts(request, "token_error");
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return redirectToProducts(request, "service_error");
  }

  const payload = tokenResult.payload;
  const expiresIn = Number(payload?.expires_in ?? 0);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  const { error: upsertError } = await supabaseAdmin
    .from("seller_mercadopago_accounts")
    .upsert(
      {
        user_id: stateResult.userId,
        mp_user_id: payload?.user_id ? String(payload.user_id) : null,
        access_token: String(payload?.access_token ?? ""),
        refresh_token: payload?.refresh_token ? String(payload.refresh_token) : null,
        public_key: payload?.public_key ? String(payload.public_key) : null,
        token_type: payload?.token_type ? String(payload.token_type) : null,
        scope: payload?.scope ? String(payload.scope) : null,
        live_mode: typeof payload?.live_mode === "boolean" ? payload.live_mode : null,
        expires_at: expiresAt,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (upsertError) {
    console.error("[mp-oauth] Account upsert failed", { error: upsertError.message });
    return redirectToProducts(request, "save_error");
  }

  return redirectToProducts(request, "connected");
};
