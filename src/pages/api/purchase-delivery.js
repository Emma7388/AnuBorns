/* API comprador: confirma recepción de productos enviados. */
import { jsonResponse } from "../../lib/apiResponse.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { refreshOrderShippingStatus } from "../../lib/fulfillmentStatus.js";
import { getUniqueStringIds } from "../../lib/orderInput.js";

/** @type {import("astro").APIRoute} */
export const POST = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "purchase-delivery",
      windowMs: 60_000,
      max: 40,
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
      return jsonResponse({ error: "El detalle de recepción no es válido." }, 400);
    }
    const orderId = String(payload?.orderId ?? "").trim();
    const productIds = getUniqueStringIds(payload?.productIds);

    if (!orderId || productIds.length === 0) {
      return jsonResponse({ error: "Faltan datos para confirmar la recepción." }, 400);
    }

    const buyerId = auth.user.id;
    /* El comprador solo puede confirmar recepciones de sus propias órdenes. */
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, shipping_requested, shipping_status")
      .eq("id", orderId)
      .eq("user_id", buyerId)
      .maybeSingle();

    if (orderError) {
      return jsonResponse({ error: "No se pudo validar la compra." }, 500);
    }
    if (!order) {
      return jsonResponse({ error: "No autorizado para confirmar esta compra." }, 403);
    }
    if (!Boolean(order.shipping_requested)) {
      return jsonResponse({ error: "Esta confirmación aplica sólo a envíos." }, 400);
    }

    /* Valida que todos los productos enviados pertenezcan a la orden. */
    const { data: orderItems, error: orderItemsError } = await supabaseAdmin
      .from("order_items")
      .select("product_id")
      .eq("order_id", orderId)
      .in("product_id", productIds);

    if (orderItemsError) {
      return jsonResponse({ error: "No se pudieron validar los productos." }, 500);
    }

    const validProductIds = [...new Set((orderItems ?? []).map((item) => String(item?.product_id ?? "").trim()).filter(Boolean))];
    if (validProductIds.length !== productIds.length) {
      return jsonResponse({ error: "La compra no coincide con los productos indicados." }, 400);
    }

    /* Solo se puede confirmar recepción cuando el vendedor ya marcó enviado. */
    const { data: dispatchRows, error: dispatchError } = await supabaseAdmin
      .from("sale_dispatches")
      .select("seller_id, product_id, fulfillment_status")
      .eq("order_id", orderId)
      .in("product_id", validProductIds);

    if (dispatchError) {
      return jsonResponse({ error: "No se pudo validar el estado de envío." }, 500);
    }

    const receivableRows = new Map(
      (dispatchRows ?? [])
        .filter((row) => {
          const status = String(row?.fulfillment_status ?? "").trim();
          return status === "shipped" || status === "delivered";
        })
        .map((row) => [
          String(row?.product_id ?? "").trim(),
          {
            sellerId: String(row?.seller_id ?? "").trim(),
            status: String(row?.fulfillment_status ?? "").trim(),
          },
        ])
        .filter(([productId, row]) => productId && row.sellerId),
    );

    if (validProductIds.some((productId) => !receivableRows.has(productId))) {
      return jsonResponse({ error: "El envío todavía no figura como enviado." }, 409);
    }

    const now = new Date().toISOString();
    const rows = validProductIds.map((productId) => ({
      seller_id: receivableRows.get(productId).sellerId,
      order_id: orderId,
      product_id: productId,
      fulfillment_status: "delivered",
      dispatched_at: now,
      status_updated_at: now,
    }));

    /* La recepción del comprador avanza el producto a delivered. */
    const { error: upsertError } = await supabaseAdmin
      .from("sale_dispatches")
      .upsert(rows, { onConflict: "seller_id,order_id,product_id" });

    if (upsertError) {
      return jsonResponse({ error: "No se pudo confirmar la recepción." }, 500);
    }

    /* Recalcula el estado agregado de la orden completa. */
    const refreshResult = await refreshOrderShippingStatus(supabaseAdmin, orderId);
    if (!refreshResult.ok) {
      console.error("[purchase-delivery] Could not refresh order shipping status", refreshResult.error);
      return jsonResponse({ error: "No se pudo actualizar el resumen de entrega." }, 500);
    }

    return jsonResponse({ ok: true, shippingStatus: refreshResult.status });
  } catch (error) {
    console.error("[purchase-delivery] Unhandled error", error);
    return jsonResponse({ error: "No se pudo confirmar la recepción." }, 500);
  }
};
