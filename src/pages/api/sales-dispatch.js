import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";

const allowedStatuses = new Set([
  "preparing",
  "shipped",
  "delivered",
  "ready_for_pickup",
  "completed",
]);

const orderStatusByFulfillment = {
  preparing: "preparing",
  shipped: "shipped",
  delivered: "delivered",
  ready_for_pickup: "ready_for_pickup",
};

const getAggregateOrderStatus = (statuses) => {
  const safeStatuses = Array.isArray(statuses) ? statuses.filter(Boolean) : [];
  if (safeStatuses.length === 0) return "";
  if (safeStatuses.every((status) => status === "completed")) return "completed";
  if (safeStatuses.every((status) => ["picked_up", "completed"].includes(status))) return "picked_up";
  if (safeStatuses.some((status) => ["ready_for_pickup", "picked_up", "completed"].includes(status))) {
    return "ready_for_pickup";
  }
  if (safeStatuses.some((status) => status === "delivered")) return "delivered";
  if (safeStatuses.some((status) => status === "shipped")) return "shipped";
  if (safeStatuses.some((status) => status === "preparing")) return "preparing";
  return "";
};

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
      if (String(currentDispatch?.fulfillment_status ?? "").trim() !== "picked_up") {
        return new Response(
          JSON.stringify({ error: "El comprador debe confirmar el retiro antes de completar el circuito." }),
          { status: 409 },
        );
      }
    }

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

    let nextOrderStatus = orderStatusByFulfillment[status];
    if (status === "completed") {
      const { data: allOrderItems } = await supabaseAdmin
        .from("order_items")
        .select("product_id")
        .eq("order_id", orderId);
      const allProductIds = [
        ...new Set((allOrderItems ?? []).map((item) => String(item?.product_id ?? "").trim()).filter(Boolean)),
      ];
      const { data: allDispatchRows } = await supabaseAdmin
        .from("sale_dispatches")
        .select("product_id, fulfillment_status")
        .eq("order_id", orderId)
        .in("product_id", allProductIds);
      const statusByProduct = new Map(
        (allDispatchRows ?? []).map((row) => [
          String(row?.product_id ?? "").trim(),
          String(row?.fulfillment_status ?? "").trim(),
        ]),
      );
      nextOrderStatus = getAggregateOrderStatus(allProductIds.map((productId) => statusByProduct.get(productId)));
    }
    if (nextOrderStatus) {
      await supabaseAdmin
        .from("orders")
        .update({ shipping_status: nextOrderStatus })
        .eq("id", orderId);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error("[sales-dispatch] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudo guardar el estado de entrega." }), { status: 500 });
  }
};
