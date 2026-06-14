/* API: checkout manual (sin MercadoPago) para registrar compras reales. */
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { buildCheckoutContext, buildOrderItems, sanitizeBuyerNote } from "../../lib/checkoutServer.js";
import { createInitialSaleDispatches } from "../../lib/saleDispatches.js";

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
    const shipping = payload?.shipping ?? {};
    const buyerNote = sanitizeBuyerNote(payload?.buyer_note);
    const checkout = await buildCheckoutContext(supabaseAdmin, {
      rawItems: payload?.items,
      shipping,
      buyerId: userData.user.id,
      requirePositivePrice: false,
    });
    if (!checkout.ok) {
      return new Response(JSON.stringify({ error: checkout.error }), { status: checkout.status });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userData.user.id,
        status: "approved",
        total_amount: checkout.totalAmount,
        currency: checkout.orderCurrency,
        shipping_full_name: String(shipping?.fullName ?? "").trim() || null,
        shipping_address: String(shipping?.address ?? "").trim() || null,
        shipping_city: String(shipping?.city ?? "").trim() || null,
        shipping_phone: String(shipping?.phone ?? "").trim() || null,
        shipping_requested: checkout.shippingRequested,
        shipping_cost: checkout.shippingCost,
        shipping_status: checkout.shippingRequested ? "requested" : "pickup_pending",
        payment_status: "manual",
        payment_detail: buyerNote ? `manual_checkout|note:${buyerNote}` : "manual_checkout",
      })
      .select("id")
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "No se pudo crear la orden." }), { status: 500 });
    }

    const orderItems = buildOrderItems(order.id, checkout.serverItems);

    const { error: itemsError } = await supabaseAdmin.from("order_items").insert(orderItems);
    if (itemsError) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return new Response(JSON.stringify({ error: "No se pudieron guardar los items." }), { status: 500 });
    }

    const dispatchResult = await createInitialSaleDispatches(supabaseAdmin, {
      orderId: order.id,
      shippingRequested: checkout.shippingRequested,
      shippingProductIds: checkout.shippingProductIds,
    });
    if (!dispatchResult.ok) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return new Response(
        JSON.stringify({ error: dispatchResult.error ?? "No se pudo inicializar la venta." }),
        { status: 500 },
      );
    }

    /* Auditoría best-effort de compra manual. */
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userData.user.id,
      event: "manual_checkout_created",
      metadata: {
        order_id: order.id,
        items_count: orderItems.length,
        total_amount: checkout.totalAmount,
        currency: checkout.orderCurrency,
        shipping_requested: checkout.shippingRequested,
        shipping_cost: checkout.shippingCost,
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
