/* API: crea orden y preferencia de pago en Mercado Pago. */
import { MercadoPagoConfig, Preference } from "mercadopago";
import { cancelAbandonedCheckoutOrders } from "../../lib/checkoutPendingOrders.js";
import {
  buildCheckoutContext,
  buildOrderItems,
} from "../../lib/checkoutServer.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";

/* Comisión marketplace configurable desde variables de entorno. */
const marketplaceFeeAmount = Number(
  process.env.MERCADOPAGO_MARKETPLACE_FEE_AMOUNT ?? 0,
);
const marketplaceFeePercent = Number(
  process.env.MERCADOPAGO_MARKETPLACE_FEE_PERCENT ?? 0,
);

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
    .select("user_id, access_token, mp_user_id")
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

  return { ok: true, sellerId, account: data };
};

export const POST = async ({ request }) => {
  try {
    /* Autenticación y disponibilidad de Supabase. */
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return new Response(
        JSON.stringify({ error: "Servicio no disponible." }),
        { status: 503 },
      );
    }
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado." }), {
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Sesión inválida." }), {
        status: 401,
      });
    }
    const cleanupResult = await cancelAbandonedCheckoutOrders(supabaseAdmin, {
      userId: userData.user.id,
    });
    if (!cleanupResult.ok) {
      console.warn("[checkout] Pending order cleanup failed", {
        error: cleanupResult.error,
      });
    }

    /* Parseo y validación del payload. */
    const payload = await request.json();
    const shipping = payload?.shipping ?? {};
    const checkout = await buildCheckoutContext(supabaseAdmin, {
      rawItems: payload?.items,
      shipping,
      buyerId: userData.user.id,
    });
    if (!checkout.ok) {
      return new Response(JSON.stringify({ error: checkout.error }), {
        status: checkout.status,
      });
    }
    const sellerAccount = await getSingleSellerAccount(
      supabaseAdmin,
      checkout.serverItems,
    );
    if (!sellerAccount.ok) {
      return new Response(JSON.stringify({ error: sellerAccount.error }), {
        status: sellerAccount.status,
      });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userData.user.id,
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
      return new Response(
        JSON.stringify({ error: "No se pudo crear la orden." }),
        { status: 500 },
      );
    }

    /* Inserta los items de la orden. */
    const orderItems = buildOrderItems(order.id, checkout.serverItems);

    const { error: itemsError } = await supabaseAdmin
      .from("order_items")
      .insert(orderItems);
    if (itemsError) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return new Response(
        JSON.stringify({ error: "No se pudieron guardar los items." }),
        { status: 500 },
      );
    }

    /* Resuelve URLs de retorno y webhook. */
    const siteUrl = process.env.SITE_URL ?? request.headers.get("origin") ?? "";
    if (!siteUrl) {
      return new Response(
        JSON.stringify({ error: "Falta configurar SITE_URL." }),
        { status: 500 },
      );
    }
    const notificationUrl = siteUrl
      ? `${siteUrl}/api/mercadopago-webhook?order_id=${order.id}`
      : undefined;

    /* Crea preferencia de pago en Mercado Pago usando token OAuth del vendedor. */
    const sellerMpClient = new MercadoPagoConfig({
      accessToken: sellerAccount.account.access_token,
    });
    const preference = new Preference(sellerMpClient);
    const marketplaceFee = getMarketplaceFee(checkout.totalAmount);
    let mpResponse;
    try {
      mpResponse = await preference.create({
        body: {
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
          external_reference: order.id,
          back_urls: {
            success: `${siteUrl}/compra-confirmada?status=approved&orderId=${order.id}`,
            failure: `${siteUrl}/compra-confirmada?status=rejected&orderId=${order.id}`,
            pending: `${siteUrl}/compra-confirmada?status=pending&orderId=${order.id}`,
          },
          auto_return: "approved",
          notification_url: notificationUrl,
          statement_descriptor: "ANUBORNS",
          ...(marketplaceFee > 0 ? { marketplace_fee: marketplaceFee } : {}),
          payer: {
            email: userData.user.email ?? undefined,
          },
        },
      });
    } catch (error) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      console.error("[checkout] Mercado Pago preference error", error);
      return new Response(
        JSON.stringify({ error: "No se pudo crear la preferencia de pago." }),
        { status: 502 },
      );
    }

    /* Guarda el id de preferencia para trazabilidad. */
    await supabaseAdmin
      .from("orders")
      .update({
        preference_id: mpResponse.id ?? null,
        payment_detail: `mp_preference|marketplace_fee:${marketplaceFee}`,
      })
      .eq("id", order.id);

    /* Responde con el init_point para redirección del cliente. */
    return new Response(
      JSON.stringify({
        init_point: mpResponse.init_point,
        preference_id: mpResponse.id,
        order_id: order.id,
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Error inesperado." }), {
      status: 500,
    });
  }
};
