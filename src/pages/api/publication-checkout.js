import { MercadoPagoConfig, Preference } from "mercadopago";
import { jsonResponse } from "../../lib/apiResponse.js";
import { MONTHLY_PUBLICATION_PRICE, PUBLICATION_REFERENCE_PREFIX } from "../../lib/publicationPayments.js";
import { getMonthlyPublicationTiming } from "../../lib/publicationTiming.js";
import { readJsonBody } from "../../lib/serverRequest.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";

const getSiteUrl = () => {
  try {
    const url = new URL(String(process.env.SITE_URL ?? ""));
    return url.protocol === "https:" ? url.origin : "";
  } catch { return ""; }
};

export const POST = async ({ request }) => {
  const rate = await checkRateLimit({ request, routeKey: "publication-checkout", windowMs: 60_000, max: 10 });
  if (!rate.allowed) return jsonResponse({ error: "Demasiadas solicitudes." }, 429);
  const supabaseAdmin = getSupabaseAdmin();
  const accessToken = String(process.env.MERCADOPAGO_ACCESS_TOKEN ?? "").trim();
  const siteUrl = getSiteUrl();
  if (!supabaseAdmin || !accessToken || !siteUrl) return jsonResponse({ error: "El cobro mensual no está configurado." }, 503);
  const auth = await getAuthenticatedUser(supabaseAdmin, request);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const body = await readJsonBody(request, { maxBytes: 5_000 });
  if (!body.ok) return jsonResponse({ error: body.error }, body.status);
  const productId = String(body.data?.product_id ?? "").trim();
  const { data: product } = await supabaseAdmin.from("products")
    .select("id,title,image_url,publication_type,publication_status,publication_expires_at")
    .eq("id", productId).eq("user_id", auth.user.id).maybeSingle();
  if (!product || product.publication_type !== "monthly") return jsonResponse({ error: "Publicación mensual no encontrada." }, 404);
  if (!product.image_url) return jsonResponse({ error: "Subí una imagen antes de pagar la publicación." }, 409);
  const timing = getMonthlyPublicationTiming({
    status: product.publication_status,
    expiresAt: product.publication_expires_at,
  });
  if (timing.active && !timing.renewalAvailable) {
    return jsonResponse({ error: "Podés renovar la publicación durante sus últimos 7 días." }, 409);
  }

  const { data: pendingRecord } = await supabaseAdmin.from("product_publication_payments")
    .select("id,init_point,created_at")
    .eq("product_id", product.id).eq("user_id", auth.user.id).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const pendingAge = pendingRecord?.created_at ? Date.now() - Date.parse(pendingRecord.created_at) : Number.POSITIVE_INFINITY;
  if (pendingRecord?.init_point && pendingAge < 24 * 60 * 60 * 1000) {
    return jsonResponse({ init_point: pendingRecord.init_point, payment_record_id: pendingRecord.id, reused: true });
  }
  if (pendingRecord?.id) {
    await supabaseAdmin.from("product_publication_payments")
      .update({ status: "cancelled", payment_detail: "stale_preference", updated_at: new Date().toISOString() })
      .eq("id", pendingRecord.id).eq("user_id", auth.user.id);
  }

  const { data: paymentRecord, error: recordError } = await supabaseAdmin.from("product_publication_payments")
    .insert({ product_id: product.id, user_id: auth.user.id, amount: MONTHLY_PUBLICATION_PRICE, currency: "ARS" })
    .select("id").single();
  if (recordError || !paymentRecord?.id) return jsonResponse({ error: recordError?.code === "23505" ? "El pago ya se está generando. Intentá nuevamente en unos segundos." : "No se pudo iniciar el pago." }, recordError?.code === "23505" ? 409 : 500);
  const reference = `${PUBLICATION_REFERENCE_PREFIX}${paymentRecord.id}`;
  const preference = new Preference(new MercadoPagoConfig({ accessToken }));
  try {
    const response = await preference.create({ body: {
      items: [{ id: product.id, title: `Publicación mensual: ${product.title}`, quantity: 1, unit_price: MONTHLY_PUBLICATION_PRICE, currency_id: "ARS" }],
      external_reference: reference,
      back_urls: {
        success: `${siteUrl}/publicacion-confirmada?status=approved&payment=${paymentRecord.id}`,
        pending: `${siteUrl}/publicacion-confirmada?status=pending&payment=${paymentRecord.id}`,
        failure: `${siteUrl}/publicacion-confirmada?status=rejected&payment=${paymentRecord.id}`,
      },
      auto_return: "approved",
      notification_url: `${siteUrl}/api/mercadopago-webhook`,
      statement_descriptor: "ANUBORNS",
      payer: { email: auth.user.email ?? undefined },
    }});
    if (!response?.id || !response?.init_point) throw new Error("invalid_preference");
    await supabaseAdmin.from("product_publication_payments")
      .update({ preference_id: String(response.id), init_point: String(response.init_point), updated_at: new Date().toISOString() })
      .eq("id", paymentRecord.id);
    return jsonResponse({ init_point: response.init_point, preference_id: response.id, payment_record_id: paymentRecord.id });
  } catch (error) {
    await supabaseAdmin.from("product_publication_payments").update({ status: "cancelled", payment_detail: "preference_create_failed" }).eq("id", paymentRecord.id);
    console.error("[publication-checkout] Preference failed", error);
    return jsonResponse({ error: "No se pudo crear el pago mensual." }, 502);
  }
};
