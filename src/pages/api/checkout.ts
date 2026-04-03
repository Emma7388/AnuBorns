import type { APIRoute } from "astro";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { supabaseAdmin } from "../../lib/supabaseServer";

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

if (!accessToken) {
  throw new Error("Missing MERCADOPAGO_ACCESS_TOKEN.");
}

const mpClient = new MercadoPagoConfig({ accessToken });

const sanitizeItems = (items: any[]) =>
  items
    .map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? "").trim(),
      price: Number(item.price ?? 0),
      qty: Math.max(1, Number(item.qty ?? 1)),
      unit: String(item.unit ?? "").trim(),
      provider: String(item.provider ?? "").trim(),
      image: String(item.image ?? "").trim(),
    }))
    .filter((item) => item.id && item.name && item.price > 0);

export const POST: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado." }), { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Sesión inválida." }), { status: 401 });
    }

    const payload = await request.json();
    const items = sanitizeItems(Array.isArray(payload?.items) ? payload.items : []);

    if (items.length === 0) {
      return new Response(JSON.stringify({ error: "El carrito está vacío." }), { status: 400 });
    }

    const shipping = payload?.shipping ?? {};
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.qty, 0);

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userData.user.id,
        status: "pending",
        total_amount: totalAmount,
        currency: "ARS",
        shipping_full_name: String(shipping.fullName ?? "").trim(),
        shipping_address: String(shipping.address ?? "").trim(),
        shipping_city: String(shipping.city ?? "").trim(),
        shipping_phone: String(shipping.phone ?? "").trim(),
      })
      .select()
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "No se pudo crear la orden." }), { status: 500 });
    }

    const orderItems = items.map((item) => ({
      order_id: order.id,
      product_id: item.id,
      name: item.name,
      qty: item.qty,
      unit_price: item.price,
      unit: item.unit,
      provider: item.provider,
      image: item.image,
    }));

    const { error: itemsError } = await supabaseAdmin.from("order_items").insert(orderItems);
    if (itemsError) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return new Response(JSON.stringify({ error: "No se pudieron guardar los items." }), { status: 500 });
    }

    const siteUrl = process.env.SITE_URL ?? request.headers.get("origin") ?? "";
    if (!siteUrl) {
      return new Response(JSON.stringify({ error: "Falta configurar SITE_URL." }), { status: 500 });
    }
    const notificationUrl = siteUrl ? `${siteUrl}/api/mercadopago-webhook` : undefined;

    const preference = new Preference(mpClient);
    const mpResponse = await preference.create({
      body: {
        items: items.map((item) => ({
          id: item.id,
          title: item.name,
          quantity: item.qty,
          unit_price: item.price,
          currency_id: "ARS",
        })),
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

    await supabaseAdmin
      .from("orders")
      .update({
        preference_id: mpResponse.id ?? null,
      })
      .eq("id", order.id);

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
