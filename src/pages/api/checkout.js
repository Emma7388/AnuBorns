/* API: crea orden y preferencia de pago en Mercado Pago. */
import { MercadoPagoConfig, Preference } from "mercadopago";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";

/* Configuración de Mercado Pago desde variables de entorno. */
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
const SHIPPING_FEE = 5000;

if (!accessToken) {
  throw new Error("Missing MERCADOPAGO_ACCESS_TOKEN.");
}

const mpClient = new MercadoPagoConfig({ accessToken });

/* Normaliza items del carrito y descarta inválidos. */
const sanitizeItems = (items) =>
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

const normalizeDeliveryMethods = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  return String(value ?? "")
    .split(/[,+]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

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
    const items = sanitizeItems(Array.isArray(payload?.items) ? payload.items : []);

    if (items.length === 0) {
      return new Response(JSON.stringify({ error: "El carrito está vacío." }), { status: 400 });
    }

    /* Crea orden en base de datos para referencia interna. */
    const shipping = payload?.shipping ?? {};
    const shippingGroups = Array.isArray(shipping?.groups) ? shipping.groups : [];
    const requestedShippingGroups = shippingGroups
      .map((group) => ({
        providerKey: String(group?.provider_key ?? "").trim(),
        address: String(group?.address ?? "").trim(),
        city: String(group?.city ?? "").trim(),
      }))
      .filter((group) => group.providerKey);
    const shippingRequested = requestedShippingGroups.length > 0 || Boolean(shipping?.requested);
    const productIds = [...new Set(items.map((item) => item.id).filter(Boolean))];
    if (shippingRequested) {
      const { data: products, error: productsError } = await supabaseAdmin
        .from("products")
        .select("id, seller_name, user_id, delivery_methods")
        .in("id", productIds);

      if (productsError) {
        return new Response(JSON.stringify({ error: "No se pudieron validar los productos." }), { status: 500 });
      }

      const productMap = new Map((products ?? []).map((product) => [String(product.id), product]));
      if (requestedShippingGroups.length === 0) {
        const allItemsSupportShipping = items.every((item) =>
          normalizeDeliveryMethods(productMap.get(item.id)?.delivery_methods).includes("envio"),
        );
        if (!allItemsSupportShipping) {
          return new Response(JSON.stringify({ error: "Hay productos que no aceptan envío." }), { status: 400 });
        }
        if (!String(shipping?.address ?? "").trim() || !String(shipping?.city ?? "").trim()) {
          return new Response(JSON.stringify({ error: "Faltan dirección y ciudad para el envío." }), { status: 400 });
        }
      }
      for (const group of requestedShippingGroups) {
        if (!group.address || !group.city) {
          return new Response(JSON.stringify({ error: "Faltan dirección y ciudad para un proveedor." }), { status: 400 });
        }
        const providerItems = items.filter((item) => {
          const product = productMap.get(item.id);
          const providerKey = product?.user_id
            ? `id:${String(product.user_id).trim()}`
            : `name:${String(product?.seller_name ?? "").trim().toLowerCase() || "n/a"}`;
          return providerKey === group.providerKey;
        });
        const providerSupportsShipping = providerItems.length > 0 && providerItems.every((item) =>
          normalizeDeliveryMethods(productMap.get(item.id)?.delivery_methods).includes("envio"),
        );
        if (!providerSupportsShipping) {
          return new Response(JSON.stringify({ error: "Hay productos que no aceptan envío." }), { status: 400 });
        }
      }
    }
    const shippingCost = requestedShippingGroups.length
      ? requestedShippingGroups.length * SHIPPING_FEE
      : shippingRequested
        ? SHIPPING_FEE
        : 0;
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.qty, 0) + shippingCost;

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
        shipping_requested: shippingRequested,
        shipping_cost: shippingCost,
        shipping_status: shippingRequested ? "requested" : "pickup_pending",
      })
      .select()
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "No se pudo crear la orden." }), { status: 500 });
    }

    /* Inserta los items de la orden. */
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

    /* Resuelve URLs de retorno y webhook. */
    const siteUrl = process.env.SITE_URL ?? request.headers.get("origin") ?? "";
    if (!siteUrl) {
      return new Response(JSON.stringify({ error: "Falta configurar SITE_URL." }), { status: 500 });
    }
    const notificationUrl = siteUrl ? `${siteUrl}/api/mercadopago-webhook` : undefined;

    /* Crea preferencia de pago en Mercado Pago. */
    const preference = new Preference(mpClient);
    const mpResponse = await preference.create({
      body: {
        items: [
          ...items.map((item) => ({
            id: item.id,
            title: item.name,
            quantity: item.qty,
            unit_price: item.price,
            currency_id: "ARS",
          })),
          ...(shippingCost
            ? [
                {
                  id: "shipping",
                  title: "Envío a domicilio",
                  quantity: 1,
                  unit_price: shippingCost,
                  currency_id: "ARS",
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
