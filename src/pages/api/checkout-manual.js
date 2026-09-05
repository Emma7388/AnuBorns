/* API: checkout manual (sin MercadoPago) para registrar compras reales. */
import { jsonResponse } from "../../lib/apiResponse.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { getClientIp } from "../../lib/requestMeta.js";
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
      return jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return jsonResponse({ error: "Servicio no disponible." }, 503);
    }

    const auth = await getAuthenticatedUser(supabaseAdmin, request);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "El detalle de compra no es válido." }, 400);
    }
    const shipping = payload?.shipping ?? {};
    const buyerNote = sanitizeBuyerNote(payload?.buyer_note);
    const checkout = await buildCheckoutContext(supabaseAdmin, {
      rawItems: payload?.items,
      shipping,
      buyerId: auth.user.id,
    });
    if (!checkout.ok) {
      return jsonResponse(
        {
          error: checkout.error,
          sold_product_ids: Array.isArray(checkout.soldProductIds) ? checkout.soldProductIds : [],
        },
        checkout.status,
      );
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: auth.user.id,
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
      return jsonResponse({ error: "No se pudo crear la orden." }, 500);
    }

    const orderItems = buildOrderItems(order.id, checkout.serverItems);

    const { error: itemsError } = await supabaseAdmin.from("order_items").insert(orderItems);
    if (itemsError) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return jsonResponse({ error: "No se pudieron guardar los items." }, 500);
    }

    const dispatchResult = await createInitialSaleDispatches(supabaseAdmin, {
      orderId: order.id,
      shippingRequested: checkout.shippingRequested,
      shippingProductIds: checkout.shippingProductIds,
    });
    if (!dispatchResult.ok) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return jsonResponse({ error: dispatchResult.error ?? "No se pudo inicializar la venta." }, 500);
    }

    /* Auditoría de mejor esfuerzo para compra manual. */
    await supabaseAdmin.from("audit_logs").insert({
      user_id: auth.user.id,
      event: "manual_checkout_created",
      metadata: {
        order_id: order.id,
        items_count: orderItems.length,
        total_amount: checkout.totalAmount,
        currency: checkout.orderCurrency,
        shipping_requested: checkout.shippingRequested,
        shipping_cost: checkout.shippingCost,
      },
      ip_address: getClientIp(request),
      user_agent: request.headers.get("user-agent") ?? "",
    });

    return jsonResponse({ ok: true, order_id: order.id });
  } catch (error) {
    console.error("[checkout-manual] Unhandled error", error);
    return jsonResponse({ error: "No se pudo procesar la compra." }, 500);
  }
};
