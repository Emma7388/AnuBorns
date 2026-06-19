/* Callback OAuth de Mercado Pago.
 * Paso inicial: deja una URL HTTPS válida para configurar la app.
 * El intercambio del code por tokens se implementa en el siguiente paso.
 */
export const GET = async ({ request }) => {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  if (error) {
    return new Response("Mercado Pago OAuth rechazado.", { status: 400 });
  }

  if (code) {
    return new Response("Mercado Pago OAuth callback recibido.", { status: 200 });
  }

  return new Response("Mercado Pago OAuth callback activo.", { status: 200 });
};
