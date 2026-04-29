/* API: checkout manual (sin MercadoPago) para registrar compras reales. */
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";

/* Normaliza items y descarta valores inválidos. */
const sanitizeItems = (items) =>
  items
    .map((item) => ({
      product_id: String(item?.product_id ?? "").trim(),
      qty: Math.max(1, Math.min(999, Number(item?.qty ?? 1))),
    }))
    .filter((item) => item.product_id);

/* Normaliza y limita nota del comprador. */
const sanitizeBuyerNote = (value) => {
  const note = String(value ?? "").trim();
  if (!note) return "";
  return note.slice(0, 500);
};

/** @type {import("astro").APIRoute} */
export const POST = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "checkout-manual",
      windowMs: 60_000,
      max: 20,
    });
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }), {
        status: 429,
      });
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

    const payload = await request.json().catch(() => ({}));
    const items = sanitizeItems(Array.isArray(payload?.items) ? payload.items : []);
    const shipping = payload?.shipping ?? {};
    const buyerNote = sanitizeBuyerNote(payload?.buyer_note);

    if (items.length === 0) {
      return new Response(JSON.stringify({ error: "El carrito esta vacio." }), { status: 400 });
    }

    const productIds = [...new Set(items.map((item) => item.product_id))];
    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, title, price, currency, seller_name, contact, user_id")
      .in("id", productIds);

    if (productsError) {
      return new Response(JSON.stringify({ error: "No se pudieron validar los productos." }), { status: 500 });
    }

    const productsMap = new Map((products ?? []).map((product) => [String(product.id), product]));
    if (productsMap.size !== productIds.length) {
      return new Response(JSON.stringify({ error: "Hay productos invalidos o no disponibles." }), { status: 400 });
    }

    const serverItems = items.map((item) => {
      const product = productsMap.get(item.product_id);
      const unitPrice = Number(product?.price ?? 0);
      const safePrice = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0;
      return {
        product_id: item.product_id,
        name: String(product?.title ?? "Producto"),
        qty: item.qty,
        unit_price: safePrice,
        provider: String(product?.seller_name ?? "").trim(),
        provider_whatsapp: String(product?.contact ?? "").trim(),
        provider_user_id: String(product?.user_id ?? "").trim(),
        currency: String(product?.currency ?? "ARS").toUpperCase(),
      };
    });

    const hasMixedCurrency = new Set(serverItems.map((item) => item.currency)).size > 1;
    if (hasMixedCurrency) {
      return new Response(JSON.stringify({ error: "No se puede comprar productos con distintas monedas." }), {
        status: 400,
      });
    }

    const hasOwnProducts = serverItems.some((item) => item.provider_user_id && item.provider_user_id === userData.user.id);
    if (hasOwnProducts) {
      return new Response(JSON.stringify({ error: "No podes comprar tus propios productos." }), { status: 400 });
    }

    const orderCurrency = serverItems[0]?.currency || "ARS";
    const totalAmount = serverItems.reduce((sum, item) => sum + item.unit_price * item.qty, 0);

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userData.user.id,
        status: "approved",
        total_amount: totalAmount,
        currency: orderCurrency,
        shipping_full_name: String(shipping?.fullName ?? "").trim() || null,
        shipping_address: String(shipping?.address ?? "").trim() || null,
        shipping_city: String(shipping?.city ?? "").trim() || null,
        shipping_phone: String(shipping?.phone ?? "").trim() || null,
        payment_status: "manual",
        payment_detail: buyerNote ? `manual_checkout|note:${buyerNote}` : "manual_checkout",
      })
      .select("id")
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "No se pudo crear la orden." }), { status: 500 });
    }

    const orderItems = serverItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      name: item.name,
      qty: item.qty,
      unit_price: item.unit_price,
      provider: item.provider || null,
      unit: null,
      image: null,
    }));

    const { error: itemsError } = await supabaseAdmin.from("order_items").insert(orderItems);
    if (itemsError) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return new Response(JSON.stringify({ error: "No se pudieron guardar los items." }), { status: 500 });
    }

    /* Auditoría best-effort de compra manual. */
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userData.user.id,
      event: "manual_checkout_created",
      metadata: {
        order_id: order.id,
        items_count: orderItems.length,
        total_amount: totalAmount,
        currency: orderCurrency,
      },
      ip_address:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        request.headers.get("cf-connecting-ip") ??
        null,
      user_agent: request.headers.get("user-agent") ?? "",
    });

    return new Response(JSON.stringify({ ok: true, order_id: order.id }), { status: 200 });
  } catch (error) {
    console.error("[checkout-manual] Unhandled error", error);
    return new Response(
      JSON.stringify({
        error: "No se pudo procesar la compra.",
      }),
      { status: 500 },
    );
  }
};
