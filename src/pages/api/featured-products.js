/* API pública: productos disponibles de vendedores destacados. */
import { getFeaturedProducts } from "../../lib/featuredProducts.js";
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
      return new Response(JSON.stringify({ error: "Demasiadas solicitudes." }), { status: 429 });
    }

    const { items, error } = await getFeaturedProducts();
    if (error) {
      const status = error === "Servicio no disponible." ? 503 : 500;
      return new Response(JSON.stringify({ error }), { status });
    }
    return new Response(JSON.stringify({ items }), { status: 200 });
  } catch (error) {
    console.error("[featured-products] Unhandled error", error);
    return new Response(JSON.stringify({ error: "No se pudieron cargar destacados." }), { status: 500 });
  }
};
