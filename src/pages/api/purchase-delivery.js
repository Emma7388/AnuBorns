/* API comprador: confirma recepción de productos enviados. */
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { refreshOrderShippingStatus } from "../../lib/fulfillmentStatus.js";

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
      return new Response(JSON.stringify({ error: "Faltan datos para confirmar la recepcion." }), { status: 400 });
    }

    const buyerId = userData.user.id;
    /* El comprador solo puede confirmar recepciones de sus propias órdenes. */
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
    if (!Boolean(order.shipping_requested)) {
      return new Response(JSON.stringify({ error: "Esta confirmacion aplica solo a envios." }), { status: 400 });
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

    /* Solo se puede confirmar recepción cuando el vendedor ya marcó enviado. */
    const { data: dispatchRows, error: dispatchError } = await supabaseAdmin
      .from("sale_dispatches")
      .select("seller_id, product_id, fulfillment_status")
      .eq("order_id", orderId)
      .in("product_id", validProductIds);

    if (dispatchError) {
      return new Response(JSON.stringify({ error: "No se pudo validar el estado de envio." }), { status: 500 });
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
      return new Response(JSON.stringify({ error: "El envio todavia no figura como enviado." }), { status: 409 });
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
      return new Response(JSON.stringify({ error: "No se pudo confirmar la recepcion." }), { status: 500 });
    }

    /* Recalcula el estado agregado de la orden completa. */
    const refreshResult = await refreshOrderShippingStatus(supabaseAdmin, orderId);
    if (!refreshResult.ok) {
      console.error("[purchase-delivery] Could not refresh order shipping status", refreshResult.error);
      return new Response(JSON.stringify({ error: "No se pudo actualizar el resumen de entrega." }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, shippingStatus: refreshResult.status }), { status: 200 });
  } catch (error) {
    console.error("[purchase-delivery] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudo confirmar la recepcion." }), { status: 500 });
  }
};
