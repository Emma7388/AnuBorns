/* Estado de conexión Mercado Pago del vendedor autenticado. */
import { jsonResponse } from "../../../../lib/apiResponse.js";
import { getAuthenticatedUser } from "../../../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../../../lib/supabaseServer.js";
import { checkRateLimit } from "../../../../lib/serverRateLimit.js";

const buildAccountLabel = (account, fallbackMpUserId) => {
  const firstName = String(account?.first_name ?? "").trim();
  const lastName = String(account?.last_name ?? "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const nickname = String(account?.nickname ?? "").trim();
  const email = String(account?.email ?? "").trim();
  const mpUserId = String(account?.id ?? fallbackMpUserId ?? "").trim();

  return fullName || nickname || email || (mpUserId ? `Usuario MP ${mpUserId}` : "");
};

const fetchMercadoPagoAccount = async (accessToken) => {
  const token = String(accessToken ?? "").trim();
  if (!token) return null;

  try {
    const response = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
};

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
      return jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return jsonResponse({ connected: false });
    }

    const auth = await getAuthenticatedUser(supabaseAdmin, request);
    if (!auth.ok) {
      return jsonResponse({ connected: false });
    }

    const { data } = await supabaseAdmin
      .from("seller_mercadopago_accounts")
      .select("mp_user_id, access_token, connected_at, expires_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const mpAccount = data?.access_token
      ? await fetchMercadoPagoAccount(data.access_token)
      : null;
    const mpUserId = String(mpAccount?.id ?? data?.mp_user_id ?? "").trim();
    const accountLabel = buildAccountLabel(mpAccount, mpUserId);

    return jsonResponse({
        connected: Boolean(data?.mp_user_id),
        account_label: accountLabel || null,
        mp_user_id: mpUserId || data?.mp_user_id || null,
        connected_at: data?.connected_at ?? null,
        expires_at: data?.expires_at ?? null,
      });
  } catch (error) {
    console.error("[mp-oauth-status] Unhandled error", error);
    return jsonResponse({ connected: false });
  }
};
