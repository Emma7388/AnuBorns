/* API vendedor: avanza el estado de entrega/retiro por producto vendido. */
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { refreshOrderShippingStatus } from "../../lib/fulfillmentStatus.js";

/* Estados que el vendedor puede marcar desde Mis ventas. */
const allowedStatuses = new Set([
  "preparing",
  "shipped",
  "ready_for_pickup",
  "completed",
]);

/** @type {import("astro").APIRoute} */
export const POST = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "sales-dispatch",
      windowMs: 60_000,
      max: 60,
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
    /* El token del navegador define el vendedor que intenta operar. */
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sesion invalida o expirada." }), { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const orderId = String(payload?.orderId ?? "").trim();
    const productId = String(payload?.productId ?? "").trim();
    const status = String(payload?.status ?? "").trim();

    if (!orderId || !productId) {
      return new Response(JSON.stringify({ error: "Faltan datos para actualizar la entrega." }), { status: 400 });
    }
    if (!allowedStatuses.has(status)) {
      return new Response(JSON.stringify({ error: "Estado de entrega invalido." }), { status: 400 });
    }

    const sellerId = userData.user.id;
    /* Seguridad: el producto debe pertenecer al vendedor autenticado. */
    const { data: ownProduct, error: ownProductError } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("user_id", sellerId)
      .maybeSingle();

    if (ownProductError) {
      return new Response(JSON.stringify({ error: "No se pudo validar el producto." }), { status: 500 });
    }
    if (!ownProduct) {
      return new Response(JSON.stringify({ error: "No autorizado para despachar este producto." }), { status: 403 });
    }

    /* Seguridad: la orden debe contener exactamente el producto indicado. */
    const { data: orderItem, error: orderItemError } = await supabaseAdmin
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .eq("product_id", productId)
      .maybeSingle();

    if (orderItemError) {
      return new Response(JSON.stringify({ error: "No se pudo validar la venta." }), { status: 500 });
    }
    if (!orderItem) {
      return new Response(JSON.stringify({ error: "La venta no coincide con el producto indicado." }), { status: 400 });
    }

    if (status === "completed") {
      /* El vendedor cierra el circuito solo después de confirmación del comprador. */
      const { data: currentDispatch, error: currentDispatchError } = await supabaseAdmin
        .from("sale_dispatches")
        .select("fulfillment_status")
        .eq("seller_id", sellerId)
        .eq("order_id", orderId)
        .eq("product_id", productId)
        .maybeSingle();

      if (currentDispatchError) {
        return new Response(JSON.stringify({ error: "No se pudo validar el estado actual." }), { status: 500 });
      }
      const currentStatus = String(currentDispatch?.fulfillment_status ?? "").trim();
      if (!["picked_up", "delivered"].includes(currentStatus)) {
        return new Response(
          JSON.stringify({ error: "El comprador debe confirmar el retiro o la recepcion antes de completar el circuito." }),
          { status: 409 },
        );
      }
    }

    /* sale_dispatches guarda el estado por producto y vendedor. */
    const { error: upsertError } = await supabaseAdmin.from("sale_dispatches").upsert(
      {
        seller_id: sellerId,
        order_id: orderId,
        product_id: productId,
        fulfillment_status: status,
        dispatched_at: new Date().toISOString(),
        status_updated_at: new Date().toISOString(),
      },
      { onConflict: "seller_id,order_id,product_id" },
    );

    if (upsertError) {
      return new Response(JSON.stringify({ error: "No se pudo guardar el estado de entrega." }), { status: 500 });
    }

    /* orders.shipping_status queda como resumen agregado para vistas rápidas. */
    const refreshResult = await refreshOrderShippingStatus(supabaseAdmin, orderId);
    if (!refreshResult.ok) {
      console.error("[sales-dispatch] Could not refresh order shipping status", refreshResult.error);
      return new Response(JSON.stringify({ error: "No se pudo actualizar el resumen de entrega." }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, shippingStatus: refreshResult.status }), { status: 200 });
  } catch (error) {
    console.error("[sales-dispatch] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudo guardar el estado de entrega." }), { status: 500 });
  }
};
