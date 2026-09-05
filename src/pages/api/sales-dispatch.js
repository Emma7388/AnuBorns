/* API vendedor: avanza el estado de entrega/retiro por producto vendido. */
import { jsonResponse } from "../../lib/apiResponse.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
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
      return jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return jsonResponse({ error: "Servicio no disponible." }, 503);
    }

    /* El token del navegador define el vendedor que intenta operar. */
    const auth = await getAuthenticatedUser(supabaseAdmin, request);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "El detalle de despacho no es válido." }, 400);
    }
    const orderId = String(payload?.orderId ?? "").trim();
    const productId = String(payload?.productId ?? "").trim();
    const status = String(payload?.status ?? "").trim();

    if (!orderId || !productId) {
      return jsonResponse({ error: "Faltan datos para actualizar la entrega." }, 400);
    }
    if (!allowedStatuses.has(status)) {
      return jsonResponse({ error: "Estado de entrega inválido." }, 400);
    }

    const sellerId = auth.user.id;
    /* Seguridad: el producto debe pertenecer al vendedor autenticado. */
    const { data: ownProduct, error: ownProductError } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("user_id", sellerId)
      .maybeSingle();

    if (ownProductError) {
      return jsonResponse({ error: "No se pudo validar el producto." }, 500);
    }
    if (!ownProduct) {
      return jsonResponse({ error: "No autorizado para despachar este producto." }, 403);
    }

    /* Seguridad: la orden debe contener exactamente el producto indicado. */
    const { data: orderItem, error: orderItemError } = await supabaseAdmin
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .eq("product_id", productId)
      .maybeSingle();

    if (orderItemError) {
      return jsonResponse({ error: "No se pudo validar la venta." }, 500);
    }
    if (!orderItem) {
      return jsonResponse({ error: "La venta no coincide con el producto indicado." }, 400);
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
        return jsonResponse({ error: "No se pudo validar el estado actual." }, 500);
      }
      const currentStatus = String(currentDispatch?.fulfillment_status ?? "").trim();
      if (!["picked_up", "delivered"].includes(currentStatus)) {
        return jsonResponse(
          { error: "El comprador debe confirmar el retiro o la recepción antes de completar el circuito." },
          409,
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
      return jsonResponse({ error: "No se pudo guardar el estado de entrega." }, 500);
    }

    /* orders.shipping_status queda como resumen agregado para vistas rápidas. */
    const refreshResult = await refreshOrderShippingStatus(supabaseAdmin, orderId);
    if (!refreshResult.ok) {
      console.error("[sales-dispatch] Could not refresh order shipping status", refreshResult.error);
      return jsonResponse({ error: "No se pudo actualizar el resumen de entrega." }, 500);
    }

    return jsonResponse({ ok: true, shippingStatus: refreshResult.status });
  } catch (error) {
    console.error("[sales-dispatch] Unhandled error", error);
    return jsonResponse({ error: "No se pudo guardar el estado de entrega." }, 500);
  }
};
