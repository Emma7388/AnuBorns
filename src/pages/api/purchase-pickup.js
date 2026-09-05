/* API comprador: confirma que retiró productos listos para retirar. */
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
      routeKey: "purchase-pickup",
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
      return jsonResponse({ error: "El detalle del retiro no es válido." }, 400);
    }
    const orderId = String(payload?.orderId ?? "").trim();
    const productIds = getUniqueStringIds(payload?.productIds);

    if (!orderId || productIds.length === 0) {
      return jsonResponse({ error: "Faltan datos para confirmar el retiro." }, 400);
    }

    const buyerId = auth.user.id;
    /* El comprador solo puede confirmar retiros de sus propias órdenes. */
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

    /* Se resuelve vendedor por producto para mantener sale_dispatches consistente. */
    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, user_id")
      .in("id", validProductIds);

    if (productsError) {
      return jsonResponse({ error: "No se pudo validar el vendedor." }, 500);
    }

    const productSellerMap = new Map(
      (products ?? [])
        .map((product) => [String(product?.id ?? "").trim(), String(product?.user_id ?? "").trim()])
        .filter(([productId, sellerId]) => productId && sellerId),
    );

    if (productSellerMap.size !== validProductIds.length) {
      return jsonResponse({ error: "Faltan datos del vendedor." }, 400);
    }

    /* El comprador solo puede confirmar si el vendedor ya marcó listo para retirar. */
    const { data: dispatchRows, error: dispatchError } = await supabaseAdmin
      .from("sale_dispatches")
      .select("seller_id, product_id, fulfillment_status")
      .eq("order_id", orderId)
      .in("product_id", validProductIds);

    if (dispatchError) {
      return jsonResponse({ error: "No se pudo validar el estado de retiro." }, 500);
    }

    const readyProducts = new Set(
      (dispatchRows ?? [])
        .filter((row) => {
          const status = String(row?.fulfillment_status ?? "").trim();
          return status === "ready_for_pickup" || status === "picked_up";
        })
        .map((row) => String(row?.product_id ?? "").trim())
        .filter(Boolean),
    );

    if (validProductIds.some((productId) => !readyProducts.has(productId))) {
      return jsonResponse({ error: "El vendedor todavía no marcó esta compra como lista para retirar." }, 409);
    }

    const now = new Date().toISOString();
    const rows = validProductIds.map((productId) => ({
      seller_id: productSellerMap.get(productId),
      order_id: orderId,
      product_id: productId,
      fulfillment_status: "picked_up",
      dispatched_at: now,
      status_updated_at: now,
    }));

    /* La confirmación del comprador avanza el producto a picked_up. */
    const { error: upsertError } = await supabaseAdmin
      .from("sale_dispatches")
      .upsert(rows, { onConflict: "seller_id,order_id,product_id" });

    if (upsertError) {
      return jsonResponse({ error: "No se pudo confirmar el retiro." }, 500);
    }

    /* Recalcula el estado agregado de la orden completa. */
    const refreshResult = await refreshOrderShippingStatus(supabaseAdmin, orderId);
    if (!refreshResult.ok) {
      console.error("[purchase-pickup] Could not refresh order shipping status", refreshResult.error);
      return jsonResponse({ error: "No se pudo actualizar el resumen de entrega." }, 500);
    }

    return jsonResponse({ ok: true, shippingStatus: refreshResult.status });
  } catch (error) {
    console.error("[purchase-pickup] Unhandled error", error);
    return jsonResponse({ error: "No se pudo confirmar el retiro." }, 500);
  }
};
