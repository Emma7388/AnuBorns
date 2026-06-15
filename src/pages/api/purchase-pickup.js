/* API comprador: confirma que retiró productos listos para retirar. */
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { refreshOrderShippingStatus } from "../../lib/fulfillmentStatus.js";

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
      return new Response(JSON.stringify({ error: "Sesion invalida o expirada." }), { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const orderId = String(payload?.orderId ?? "").trim();
    const productIds = [...new Set(
      (Array.isArray(payload?.productIds) ? payload.productIds : [])
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    )];

    if (!orderId || productIds.length === 0) {
      return new Response(JSON.stringify({ error: "Faltan datos para confirmar el retiro." }), { status: 400 });
    }

    const buyerId = userData.user.id;
    /* El comprador solo puede confirmar retiros de sus propias órdenes. */
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, shipping_requested, shipping_status")
      .eq("id", orderId)
      .eq("user_id", buyerId)
      .maybeSingle();

    if (orderError) {
      return new Response(JSON.stringify({ error: "No se pudo validar la compra." }), { status: 500 });
    }
    if (!order) {
      return new Response(JSON.stringify({ error: "No autorizado para confirmar esta compra." }), { status: 403 });
    }
    /* Valida que todos los productos enviados pertenezcan a la orden. */
    const { data: orderItems, error: orderItemsError } = await supabaseAdmin
      .from("order_items")
      .select("product_id")
      .eq("order_id", orderId)
      .in("product_id", productIds);

    if (orderItemsError) {
      return new Response(JSON.stringify({ error: "No se pudieron validar los productos." }), { status: 500 });
    }

    const validProductIds = [...new Set((orderItems ?? []).map((item) => String(item?.product_id ?? "").trim()).filter(Boolean))];
    if (validProductIds.length !== productIds.length) {
      return new Response(JSON.stringify({ error: "La compra no coincide con los productos indicados." }), { status: 400 });
    }

    /* Se resuelve vendedor por producto para mantener sale_dispatches consistente. */
    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, user_id")
      .in("id", validProductIds);

    if (productsError) {
      return new Response(JSON.stringify({ error: "No se pudo validar el vendedor." }), { status: 500 });
    }

    const productSellerMap = new Map(
      (products ?? [])
        .map((product) => [String(product?.id ?? "").trim(), String(product?.user_id ?? "").trim()])
        .filter(([productId, sellerId]) => productId && sellerId),
    );

    if (productSellerMap.size !== validProductIds.length) {
      return new Response(JSON.stringify({ error: "Faltan datos del vendedor." }), { status: 400 });
    }

    /* El comprador solo puede confirmar si el vendedor ya marcó listo para retirar. */
    const { data: dispatchRows, error: dispatchError } = await supabaseAdmin
      .from("sale_dispatches")
      .select("seller_id, product_id, fulfillment_status")
      .eq("order_id", orderId)
      .in("product_id", validProductIds);

    if (dispatchError) {
      return new Response(JSON.stringify({ error: "No se pudo validar el estado de retiro." }), { status: 500 });
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
      return new Response(JSON.stringify({ error: "El vendedor todavia no marco esta compra como lista para retirar." }), {
        status: 409,
      });
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
      return new Response(JSON.stringify({ error: "No se pudo confirmar el retiro." }), { status: 500 });
    }

    /* Recalcula el estado agregado de la orden completa. */
    const refreshResult = await refreshOrderShippingStatus(supabaseAdmin, orderId);
    if (!refreshResult.ok) {
      console.error("[purchase-pickup] Could not refresh order shipping status", refreshResult.error);
      return new Response(JSON.stringify({ error: "No se pudo actualizar el resumen de entrega." }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, shippingStatus: refreshResult.status }), { status: 200 });
  } catch (error) {
    console.error("[purchase-pickup] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudo confirmar el retiro." }), { status: 500 });
  }
};
