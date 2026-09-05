/* API pública: productos disponibles de vendedores destacados. */
import { getFeaturedProducts } from "../../lib/featuredProducts.js";
import { jsonResponse } from "../../lib/apiResponse.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";

export const GET = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "featured-products",
      windowMs: 60_000,
      max: 120,
    });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas solicitudes." }, 429);
    }

    const { items, error } = await getFeaturedProducts();
    if (error) {
      const status = error === "Servicio no disponible." ? 503 : 500;
      return jsonResponse({ error }, status);
    }
    return jsonResponse({ items });
  } catch (error) {
    console.error("[featured-products] Unhandled error", error);
    return jsonResponse({ error: "No se pudieron cargar destacados." }, 500);
  }
};
