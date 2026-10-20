/* API: crea orden y preferencia de pago en Mercado Pago. */
import { MercadoPagoConfig, Preference } from "mercadopago";
import {
  cancelAbandonedCheckoutOrders,
  getCheckoutPreferenceExpiration,
} from "../../lib/checkoutPendingOrders.js";
import { buildCheckoutContext } from "../../lib/checkoutServer.js";
import { createAtomicCheckoutOrder } from "../../lib/atomicOrders.js";
import { jsonResponse } from "../../lib/apiResponse.js";
import { calculateMarketplaceFee } from "../../lib/marketplaceFee.js";
import { readJsonBody } from "../../lib/serverRequest.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { compareMercadoPagoIdentity } from "../../lib/mercadopagoIdentity.js";
import {
  decryptMercadoPagoAccount,
  encryptMercadoPagoAccountTokens,
} from "../../lib/mercadopagoTokenCrypto.js";

/* Comisión marketplace configurable desde variables de entorno. */
const marketplaceFeeAmount = Number(
  process.env.MERCADOPAGO_MARKETPLACE_FEE_AMOUNT ?? 0,
);
const marketplaceFeePercent = Number(
  process.env.MERCADOPAGO_MARKETPLACE_FEE_PERCENT ?? 0,
);
const marketplaceId = String(process.env.MERCADOPAGO_MARKETPLACE_ID ?? "").trim();
const sendMarketplaceField =
  String(process.env.MERCADOPAGO_SEND_MARKETPLACE_FIELD ?? "false").toLowerCase() === "true";
const OAUTH_REQUEST_TIMEOUT_MS = 8_000;
const OAUTH_REFRESH_GRACE_MS = 5 * 60 * 1_000;

const getMarketplaceFee = (productSubtotal) => {
  return calculateMarketplaceFee(productSubtotal, {
    fixedAmount: marketplaceFeeAmount,
    percent: marketplaceFeePercent,
  });
};

/* Evita crear una orden si las URLs de retorno no son utilizables por Checkout Pro. */
const resolveCheckoutSiteUrl = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: false, error: "Falta configurar SITE_URL." };

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      return { ok: false, error: "SITE_URL debe ser una URL HTTPS válida." };
    }
    return { ok: true, value: url.origin };
  } catch {
    return { ok: false, error: "SITE_URL debe ser una URL HTTPS válida." };
  }
};

const buildItemDescription = (item) => {
  const description = String(item?.description ?? "").trim();
  const provider = String(item?.provider ?? "").trim();
  const fallback = [
    description ||
      `Producto publicado en AnuBorns: ${String(item?.name ?? "Producto").trim() || "Producto"}`,
    provider ? `Vendedor: ${provider}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  return fallback.slice(0, 600);
};

const getSingleSellerAccount = async (supabaseAdmin, serverItems) => {
  const sellerIds = [
    ...new Set(
      (serverItems ?? [])
        .map((item) => String(item?.provider_user_id ?? "").trim())
        .filter(Boolean),
    ),
  ];

  if (sellerIds.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "No se pudo identificar el vendedor.",
    };
  }
  if (sellerIds.length > 1) {
    return {
      ok: false,
      status: 400,
      error:
        "Por ahora solo podés finalizar productos de un vendedor por compra.",
    };
  }

  const sellerId = sellerIds[0];
  const { data, error } = await supabaseAdmin
    .from("seller_mercadopago_accounts")
    .select("user_id, access_token, refresh_token, mp_user_id, expires_at")
    .eq("user_id", sellerId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      error: "No se pudo validar Mercado Pago del vendedor.",
    };
  }
  if (!data?.access_token) {
    return {
      ok: false,
      status: 409,
      error: "El vendedor todavía no tiene Mercado Pago conectado.",
    };
  }
  if (!data?.mp_user_id) {
    return {
      ok: false,
      status: 409,
      error: "El vendedor todavía no tiene un usuario de Mercado Pago asociado.",
    };
  }

  return { ok: true, sellerId, account: decryptMercadoPagoAccount(data) };
};

const isOAuthTokenCloseToExpiry = (expiresAt) => {
  const expiresAtMs = Date.parse(String(expiresAt ?? ""));
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs <= Date.now() + OAUTH_REFRESH_GRACE_MS;
};

const discardIncompleteOrder = async (supabaseAdmin, orderId, reason) => {
  const { error } = await supabaseAdmin.from("orders").delete().eq("id", orderId);
  if (error) {
    console.error("[checkout] Incomplete order cleanup failed", { orderId, reason, error });
  }
};

const buildPreferenceTrace = ({ marketplaceFee, oauthSellerId }) =>
  `mp_preference|marketplace_fee:${marketplaceFee}|marketplace:${
    sendMarketplaceField && marketplaceFee > 0 ? marketplaceId || "none" : "omitted"
  }|oauth_seller:${oauthSellerId}`;

/* Renueva el token del seller antes de cobrar, sólo si está por vencer. */
const refreshSellerOAuthTokenIfNeeded = async (supabaseAdmin, account) => {
  if (!isOAuthTokenCloseToExpiry(account.expires_at)) {
    return { ok: true, account };
  }

  const clientId = String(process.env.MERCADOPAGO_CLIENT_ID ?? "").trim();
  const clientSecret = String(process.env.MERCADOPAGO_CLIENT_SECRET ?? "").trim();
  const refreshToken = String(account.refresh_token ?? "").trim();
  if (!clientId || !clientSecret || !refreshToken) {
    return {
      ok: false,
      error: "La conexión Mercado Pago del vendedor venció. Debe reconectarla para cobrar.",
      detail: "oauth_refresh_credentials_missing",
    };
  }

  let response;
  let payload;
  try {
    response = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
    });
    payload = await response.json().catch(() => ({}));
  } catch {
    return {
      ok: false,
      error: "No se pudo renovar la conexión Mercado Pago del vendedor. Intentá nuevamente.",
      detail: "oauth_refresh_request_failed",
    };
  }

  const accessToken = String(payload?.access_token ?? "").trim();
  if (!response.ok || !accessToken) {
    return {
      ok: false,
      error: "La conexión Mercado Pago del vendedor venció. Debe reconectarla para cobrar.",
      detail: String(payload?.message ?? payload?.error ?? `HTTP ${response.status}`),
    };
  }

  const expiresIn = Number(payload?.expires_in ?? 0);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;
  const refreshedAccount = {
    ...account,
    access_token: accessToken,
    refresh_token: String(payload?.refresh_token ?? refreshToken).trim(),
    expires_at: expiresAt,
  };
  const encryptedTokens = encryptMercadoPagoAccountTokens(refreshedAccount);
  const { error: updateError } = await supabaseAdmin
    .from("seller_mercadopago_accounts")
    .update({
      access_token: encryptedTokens.access_token,
      refresh_token: encryptedTokens.refresh_token,
      expires_at: refreshedAccount.expires_at,
    })
    .eq("user_id", account.user_id);

  if (updateError) {
    return {
      ok: false,
      error: "No se pudo guardar la renovación de Mercado Pago. Intentá nuevamente.",
      detail: "oauth_refresh_persist_failed",
    };
  }

  return { ok: true, account: refreshedAccount };
};

/* Comprueba que el token OAuth usado para cobrar pertenece al seller conectado. */
const validateSellerOAuthIdentity = async (supabaseAdmin, account) => {
  let response;
  let payload;
  try {
    response = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${account.access_token}` },
      signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
    });
    payload = await response.json().catch(() => ({}));
  } catch {
    return {
      ok: false,
      error: "No se pudo validar la conexión Mercado Pago del vendedor. Intentá nuevamente.",
      detail: "oauth_identity_request_failed",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: "No se pudo validar el token OAuth vigente del vendedor.",
      detail: String(payload?.message ?? payload?.error ?? `HTTP ${response.status}`),
    };
  }

  const authorizedSellerId = String(payload?.id ?? "").trim();
  const storedSellerId = String(account.mp_user_id ?? "").trim();
  if (!authorizedSellerId || authorizedSellerId !== storedSellerId) {
    return {
      ok: false,
      error: "El token OAuth no corresponde a la cuenta Mercado Pago conectada del vendedor.",
      detail: `oauth_user:${authorizedSellerId || "none"}|stored_user:${storedSellerId || "none"}`,
    };
  }

  const [{ data: profile }, { data: sellerAuth }] = await Promise.all([
    supabaseAdmin.from("profiles").select("first_name,last_name,dni").eq("user_id", account.user_id).maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(account.user_id),
  ]);
  const identity = compareMercadoPagoIdentity({ mpAccount: payload, profile, authUser: sellerAuth?.user });
  if (!identity.matches) {
    return {
      ok: false,
      error: `El vendedor debe actualizar sus datos para que coincidan con Mercado Pago (${identity.mismatches.join(", ")}).`,
      detail: `oauth_identity_mismatch:${identity.mismatches.join(",")}`,
    };
  }

  return { ok: true, sellerId: authorizedSellerId };
};

const buildPreferenceBody = ({
  checkout,
  orderId,
  siteUrl,
  notificationUrl,
  userEmail,
  marketplaceFee = 0,
  marketplace = "",
}) => ({
  items: checkout.serverItems.map((item) => ({
    id: item.product_id,
    title: item.name,
    description: buildItemDescription(item),
    quantity: item.qty,
    unit_price: item.unit_price,
    currency_id: checkout.orderCurrency,
  })),
  external_reference: orderId,
  ...getCheckoutPreferenceExpiration(),
  back_urls: {
    success: `${siteUrl}/compra-confirmada?status=approved&orderId=${orderId}`,
    failure: `${siteUrl}/compra-confirmada?status=rejected&orderId=${orderId}`,
    pending: `${siteUrl}/compra-confirmada?status=pending&orderId=${orderId}`,
  },
  auto_return: "approved",
  notification_url: notificationUrl,
  statement_descriptor: "ANUBORNS",
  ...(marketplaceFee > 0 && marketplace ? { marketplace } : {}),
  ...(marketplaceFee > 0 ? { marketplace_fee: marketplaceFee } : {}),
  payer: {
    email: userEmail ?? undefined,
  },
});

export const POST = async ({ request }) => {
  try {
    const rate = await checkRateLimit({
      request,
      routeKey: "checkout",
      windowMs: 60_000,
      max: 20,
    });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429);
    }

    /* Autenticación y disponibilidad de Supabase. */
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return jsonResponse({ error: "Servicio no disponible." }, 503);
    }
    const auth = await getAuthenticatedUser(supabaseAdmin, request);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
    const user = auth.user;
    const cleanupResult = await cancelAbandonedCheckoutOrders(supabaseAdmin, {
      userId: user.id,
    });
    if (!cleanupResult.ok) {
      console.warn("[checkout] Pending order cleanup failed", {
        error: cleanupResult.error,
      });
    }

    /* Parseo y validación del payload. */
    const body = await readJsonBody(request, { maxBytes: 20_000 });
    if (!body.ok) return jsonResponse({ error: body.error }, body.status);
    const payload = body.data;
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "El detalle de compra no es válido." }, 400);
    }
    const shipping = payload?.shipping ?? {};
    const expectedProviderUserId = String(payload?.provider_user_id ?? "").trim();
    const checkout = await buildCheckoutContext(supabaseAdmin, {
      rawItems: payload?.items,
      shipping,
      buyerId: user.id,
      expectedProviderUserId,
    });
    if (!checkout.ok) {
      return jsonResponse({ error: checkout.error }, checkout.status);
    }

    const siteUrlResult = resolveCheckoutSiteUrl(process.env.SITE_URL);
    if (!siteUrlResult.ok) {
      return jsonResponse({ error: siteUrlResult.error }, 500);
    }

    /* El contrato permanente paga 1,5% por venta; el mensual ya pagó ARS 2.000. */
    const marketplaceFee = getMarketplaceFee(checkout.commissionableSubtotal);
    if (marketplaceFee >= checkout.totalAmount && marketplaceFee > 0) {
      return jsonResponse(
        { error: "La comisión Marketplace debe ser menor al total de la compra." },
        422,
      );
    }

    const sellerAccount = await getSingleSellerAccount(
      supabaseAdmin,
      checkout.serverItems,
    );
    if (!sellerAccount.ok) {
      return jsonResponse({ error: sellerAccount.error }, sellerAccount.status);
    }
    const refreshedSellerAccount = await refreshSellerOAuthTokenIfNeeded(
      supabaseAdmin,
      sellerAccount.account,
    );
    if (!refreshedSellerAccount.ok) {
      console.warn("[checkout] Seller OAuth refresh failed", {
        detail: refreshedSellerAccount.detail,
      });
      return jsonResponse({ error: refreshedSellerAccount.error }, 409);
    }
    const oauthIdentity = await validateSellerOAuthIdentity(supabaseAdmin, refreshedSellerAccount.account);
    if (!oauthIdentity.ok) {
      console.warn("[checkout] Seller OAuth validation failed", {
        detail: oauthIdentity.detail,
      });
      return jsonResponse({ error: oauthIdentity.error }, 409);
    }

    /* La RPC bloquea, revalida y reserva todos los productos en una transacción. */
    const atomicOrder = await createAtomicCheckoutOrder(supabaseAdmin, {
      userId: user.id,
      status: "pending",
      checkout,
      shipping,
      shippingStatus: checkout.shippingRequested ? "requested" : "pickup_pending",
    });
    if (!atomicOrder.ok) {
      return jsonResponse(
        {
          error: atomicOrder.error,
          sold_product_ids: atomicOrder.soldProductIds ?? [],
        },
        atomicOrder.status,
      );
    }
    const order = atomicOrder.order;

    /* Las URLs se validaron antes de persistir la orden. */
    const siteUrl = siteUrlResult.value;
    const notificationUrl = `${siteUrl}/api/mercadopago-webhook?order_id=${order.id}`;

    /* Crea preferencia de pago en Mercado Pago. */
    const preference = new Preference(
      new MercadoPagoConfig({
        accessToken: refreshedSellerAccount.account.access_token,
      }),
    );
    let mpResponse;
    const preferenceBody = buildPreferenceBody({
      checkout,
      orderId: order.id,
      siteUrl,
      notificationUrl,
      userEmail: user.email,
      marketplaceFee,
      marketplace:
        sendMarketplaceField && marketplaceFee > 0 ? marketplaceId : "",
    });
    try {
      mpResponse = await preference.create({
        body: preferenceBody,
      });
    } catch (error) {
      await discardIncompleteOrder(supabaseAdmin, order.id, "preference_create_failed");
      console.error("[checkout] Mercado Pago preference error", error);
      return jsonResponse({ error: "No se pudo crear la preferencia de pago." }, 502);
    }

    const preferenceId = String(mpResponse?.id ?? "").trim();
    const initPoint = String(mpResponse?.init_point ?? "").trim();
    if (!preferenceId || !initPoint) {
      await discardIncompleteOrder(supabaseAdmin, order.id, "preference_response_incomplete");
      console.error("[checkout] Mercado Pago returned an incomplete preference", {
        orderId: order.id,
        hasPreferenceId: Boolean(preferenceId),
        hasInitPoint: Boolean(initPoint),
      });
      return jsonResponse({ error: "Mercado Pago no devolvió una preferencia válida." }, 502);
    }

    /* Guarda el id de preferencia para trazabilidad. */
    await supabaseAdmin
      .from("orders")
      .update({
        preference_id: preferenceId,
        payment_detail: buildPreferenceTrace({
          marketplaceFee,
          oauthSellerId: oauthIdentity.sellerId,
        }),
      })
      .eq("id", order.id);

    /* Responde con el init_point para redirección del cliente. */
    return jsonResponse(
      {
        init_point: initPoint,
        preference_id: preferenceId,
        order_id: order.id,
      },
      200,
    );
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Error inesperado." }, 500);
  }
};
