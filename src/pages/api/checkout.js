/* API: crea orden y preferencia de pago en Mercado Pago. */
import { MercadoPagoConfig, Preference } from "mercadopago";
import { cancelAbandonedCheckoutOrders } from "../../lib/checkoutPendingOrders.js";
import {
  buildCheckoutContext,
  buildOrderItems,
} from "../../lib/checkoutServer.js";
import { jsonResponse } from "../../lib/apiResponse.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";

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

const getMarketplaceFee = (totalAmount) => {
  if (Number.isFinite(marketplaceFeeAmount) && marketplaceFeeAmount > 0) {
    return Math.min(Math.round(marketplaceFeeAmount), totalAmount);
  }
  if (Number.isFinite(marketplaceFeePercent) && marketplaceFeePercent > 0) {
    return Math.min(
      totalAmount,
      Math.round(totalAmount * (marketplaceFeePercent / 100)),
    );
  }
  return 0;
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

  return { ok: true, sellerId, account: data };
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
  const { error: updateError } = await supabaseAdmin
    .from("seller_mercadopago_accounts")
    .update({
      access_token: refreshedAccount.access_token,
      refresh_token: refreshedAccount.refresh_token,
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
const validateSellerOAuthIdentity = async (account) => {
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
  items: [
    ...checkout.serverItems.map((item) => ({
      id: item.product_id,
      title: item.name,
      description: buildItemDescription(item),
      quantity: item.qty,
      unit_price: item.unit_price,
      currency_id: checkout.orderCurrency,
    })),
    ...(checkout.shippingCost
      ? [
          {
            id: "shipping",
            title: "Envío a domicilio",
            description:
              "Servicio de envío a domicilio coordinado desde AnuBorns",
            quantity: 1,
            unit_price: checkout.shippingCost,
            currency_id: checkout.orderCurrency,
          },
        ]
      : []),
  ],
  external_reference: orderId,
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
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "El detalle de compra no es válido." }, 400);
    }
    const shipping = payload?.shipping ?? {};
    const checkout = await buildCheckoutContext(supabaseAdmin, {
      rawItems: payload?.items,
      shipping,
      buyerId: user.id,
    });
    if (!checkout.ok) {
      return jsonResponse({ error: checkout.error }, checkout.status);
    }

    const siteUrlResult = resolveCheckoutSiteUrl(
      process.env.SITE_URL ?? request.headers.get("origin"),
    );
    if (!siteUrlResult.ok) {
      return jsonResponse({ error: siteUrlResult.error }, 500);
    }

    const marketplaceFee = getMarketplaceFee(checkout.totalAmount);
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
    const oauthIdentity = await validateSellerOAuthIdentity(refreshedSellerAccount.account);
    if (!oauthIdentity.ok) {
      console.warn("[checkout] Seller OAuth validation failed", {
        detail: oauthIdentity.detail,
      });
      return jsonResponse({ error: oauthIdentity.error }, 409);
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: user.id,
        status: "pending",
        total_amount: checkout.totalAmount,
        currency: checkout.orderCurrency,
        shipping_full_name: String(shipping.fullName ?? "").trim(),
        shipping_address: String(shipping.address ?? "").trim(),
        shipping_city: String(shipping.city ?? "").trim(),
        shipping_phone: String(shipping.phone ?? "").trim(),
        shipping_requested: checkout.shippingRequested,
        shipping_cost: checkout.shippingCost,
        shipping_status: checkout.shippingRequested
          ? "requested"
          : "pickup_pending",
      })
      .select()
      .single();

    if (orderError || !order) {
      return jsonResponse({ error: "No se pudo crear la orden." }, 500);
    }

    /* Inserta los items de la orden. */
    const orderItems = buildOrderItems(order.id, checkout.serverItems);

    const { error: itemsError } = await supabaseAdmin
      .from("order_items")
      .insert(orderItems);
    if (itemsError) {
      await discardIncompleteOrder(supabaseAdmin, order.id, "order_items_insert_failed");
      return jsonResponse({ error: "No se pudieron guardar los items." }, 500);
    }

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
