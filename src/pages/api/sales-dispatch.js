import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";

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

    if (!orderId || !productId) {
      return new Response(JSON.stringify({ error: "Faltan datos para marcar despacho." }), { status: 400 });
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

    const { error: upsertError } = await supabaseAdmin.from("sale_dispatches").upsert(
      {
        seller_id: sellerId,
        order_id: orderId,
        product_id: productId,
        dispatched_at: new Date().toISOString(),
      },
      { onConflict: "seller_id,order_id,product_id" },
    );

    if (upsertError) {
      return new Response(JSON.stringify({ error: "No se pudo guardar el despacho." }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error("[sales-dispatch] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudo guardar el despacho." }), { status: 500 });
  }
};
