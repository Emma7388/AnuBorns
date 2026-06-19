/* Alias del callback OAuth de Mercado Pago. */
export const GET = async ({ request }) => {
  const url = new URL(request.url);
  const target = new URL("/api/mp-oauth", request.url);
  target.search = url.search;
  return Response.redirect(target.toString(), 302);
};
