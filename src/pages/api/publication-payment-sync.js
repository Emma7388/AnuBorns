import { jsonResponse } from "../../lib/apiResponse.js";
import { applyPublicationPayment, PUBLICATION_REFERENCE_PREFIX } from "../../lib/publicationPayments.js";
import { readJsonBody } from "../../lib/serverRequest.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";

export const POST = async ({ request }) => {
  const rate = checkRateLimit({ request, routeKey: "publication-sync", windowMs: 60_000, max: 20 });
  if (!rate.allowed) return jsonResponse({ error: "Demasiadas solicitudes." }, 429);
  const supabaseAdmin = getSupabaseAdmin();
  const accessToken = String(process.env.MERCADOPAGO_ACCESS_TOKEN ?? "").trim();
  if (!supabaseAdmin || !accessToken) return jsonResponse({ error: "Servicio no disponible." }, 503);
  const auth = await getAuthenticatedUser(supabaseAdmin, request);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const body = await readJsonBody(request, { maxBytes: 5_000 });
  if (!body.ok) return jsonResponse({ error: body.error }, body.status);
  const recordId = String(body.data?.payment_record_id ?? "").trim();
  const { data: record } = await supabaseAdmin.from("product_publication_payments")
    .select("id,user_id,payment_id,status").eq("id", recordId).eq("user_id", auth.user.id).maybeSingle();
  if (!record) return jsonResponse({ error: "Pago no encontrado." }, 404);

  const reference = `${PUBLICATION_REFERENCE_PREFIX}${record.id}`;
  const endpoint = record.payment_id
    ? `https://api.mercadopago.com/v1/payments/${encodeURIComponent(record.payment_id)}`
    : `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc`;
  try {
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8_000) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return jsonResponse({ error: "Mercado Pago no pudo confirmar el estado." }, 502);
    const payment = record.payment_id ? payload : payload?.results?.[0];
    if (!payment) return jsonResponse({ status: "pending", publication_status: "pending_payment" });
    const result = await applyPublicationPayment(supabaseAdmin, payment);
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse({ status: payment.status, publication_status: result.publicationStatus, expires_at: result.expiresAt ?? null });
  } catch {
    return jsonResponse({ error: "No se pudo consultar Mercado Pago." }, 502);
  }
};
