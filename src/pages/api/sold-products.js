/* API: consulta acotada de productos ya vendidos. */
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { getSoldProductIds } from "../../lib/soldProducts.js";

const normalizeIds = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 100);

/** @type {import("astro").APIRoute} */
export const POST = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "sold-products",
      windowMs: 60_000,
      max: 120,
    });
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }), {
        status: 429,
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ sold_product_ids: [] }), { status: 200 });
    }

    const payload = await request.json().catch(() => ({}));
    const ids = normalizeIds(payload?.product_ids);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ sold_product_ids: [] }), { status: 200 });
    }

    const soldProductIds = await getSoldProductIds(supabaseAdmin, ids);
    return new Response(
      JSON.stringify({ sold_product_ids: [...soldProductIds] }),
      { status: 200 },
    );
  } catch (error) {
    console.error("[sold-products] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudo validar disponibilidad." }), { status: 500 });
  }
};
