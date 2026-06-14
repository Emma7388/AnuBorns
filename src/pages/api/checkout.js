/* API: crea orden y preferencia de pago en Mercado Pago. */
import { MercadoPagoConfig, Preference } from "mercadopago";
import { buildCheckoutContext, buildOrderItems } from "../../lib/checkoutServer.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";

/* Configuración de Mercado Pago desde variables de entorno. */
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

if (!accessToken) {
  throw new Error("Missing MERCADOPAGO_ACCESS_TOKEN.");
}

const mpClient = new MercadoPagoConfig({ accessToken });

export const POST = async ({ request }) => {
  try {
    /* Autenticación y disponibilidad de Supabase. */
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ error: "Servicio no disponible." }), { status: 503 });
    }
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado." }), { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Sesión inválida." }), { status: 401 });
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
      return new Response(JSON.stringify({ error: checkout.error }), { status: checkout.status });
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
        shipping_status: checkout.shippingRequested ? "requested" : "pickup_pending",
      })
      .select()
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "No se pudo crear la orden." }), { status: 500 });
    }

    /* Inserta los items de la orden. */
    const orderItems = buildOrderItems(order.id, checkout.serverItems);

    const { error: itemsError } = await supabaseAdmin.from("order_items").insert(orderItems);
    if (itemsError) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return new Response(JSON.stringify({ error: "No se pudieron guardar los items." }), { status: 500 });
    }

    /* Resuelve URLs de retorno y webhook. */
    const siteUrl = process.env.SITE_URL ?? request.headers.get("origin") ?? "";
    if (!siteUrl) {
      return new Response(JSON.stringify({ error: "Falta configurar SITE_URL." }), { status: 500 });
    }
    const notificationUrl = siteUrl ? `${siteUrl}/api/mercadopago-webhook` : undefined;

    /* Crea preferencia de pago en Mercado Pago. */
    const preference = new Preference(mpClient);
    let mpResponse;
    try {
      mpResponse = await preference.create({
        body: {
          items: [
            ...checkout.serverItems.map((item) => ({
              id: item.product_id,
              title: item.name,
              quantity: item.qty,
              unit_price: item.unit_price,
              currency_id: checkout.orderCurrency,
            })),
            ...(checkout.shippingCost
              ? [
                  {
                    id: "shipping",
                    title: "Envío a domicilio",
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
          payer: {
            email: userData.user.email ?? undefined,
          },
        },
      });
    } catch (error) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      console.error("[checkout] Mercado Pago preference error", error);
      return new Response(JSON.stringify({ error: "No se pudo crear la preferencia de pago." }), { status: 502 });
    }

    /* Guarda el id de preferencia para trazabilidad. */
    await supabaseAdmin
      .from("orders")
      .update({
        preference_id: mpResponse.id ?? null,
      })
      .eq("id", order.id);

    /* Responde con el init_point para redirección del cliente. */
    return new Response(
      JSON.stringify({
        init_point: mpResponse.init_point,
        preference_id: mpResponse.id,
        order_id: order.id,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Error inesperado." }), { status: 500 });
  }
};
