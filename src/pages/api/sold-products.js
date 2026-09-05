/* API: consulta acotada de productos ya vendidos. */
import { jsonResponse } from "../../lib/apiResponse.js";
import { getUniqueStringIds } from "../../lib/orderInput.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { getSoldProductIds } from "../../lib/soldProducts.js";

const normalizeIds = (value) => getUniqueStringIds(value).slice(0, 100);

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
      return jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return jsonResponse({ sold_product_ids: [] });
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "El detalle de productos no es válido." }, 400);
    }
    const ids = normalizeIds(payload?.product_ids);
    if (ids.length === 0) {
      return jsonResponse({ sold_product_ids: [] });
    }

    const soldProductIds = await getSoldProductIds(supabaseAdmin, ids);
    return jsonResponse({ sold_product_ids: [...soldProductIds] });
  } catch (error) {
    console.error("[sold-products] Unhandled error", error);
    return jsonResponse({ error: "No se pudo validar disponibilidad." }, 500);
  }
};
