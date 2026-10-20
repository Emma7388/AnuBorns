import { defineMiddleware } from "astro:middleware";

const STYLE_ATTRIBUTE_DIRECTIVE = "style-src-attr 'unsafe-inline'";

/**
 * Astro 6 genera y mantiene los hashes de scripts y bloques <style>, pero aún
 * no permite configurar style-src-attr por separado. La UI sólo necesita esta
 * excepción acotada para estilos visuales calculados en runtime.
 */
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  const contentSecurityPolicy = response.headers.get("content-security-policy");
  if (!contentSecurityPolicy || contentSecurityPolicy.includes("style-src-attr")) return response;

  const headers = new Headers(response.headers);
  headers.set("content-security-policy", `${contentSecurityPolicy} ${STYLE_ATTRIBUTE_DIRECTIVE};`);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
