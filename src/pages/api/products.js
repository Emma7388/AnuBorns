import { jsonResponse } from "../../lib/apiResponse.js";
import { sanitizeProductInput } from "../../lib/productInput.js";
import { readJsonBody } from "../../lib/serverRequest.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { validateSellerMercadoPagoIdentity } from "../../lib/mercadopagoIdentity.js";

export const POST = async ({ request }) => {
  const rate = await checkRateLimit({ request, routeKey: "products-create", windowMs: 60_000, max: 10 });
  if (!rate.allowed) return jsonResponse({ error: "Demasiadas solicitudes." }, 429);
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);
  const auth = await getAuthenticatedUser(supabaseAdmin, request);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const body = await readJsonBody(request, { maxBytes: 30_000 });
  if (!body.ok) return jsonResponse({ error: body.error }, body.status);
  const parsed = sanitizeProductInput(body.data);
  if (!parsed.ok) return jsonResponse({ error: parsed.errors[0], errors: parsed.errors }, 400);

  const identity = await validateSellerMercadoPagoIdentity(supabaseAdmin, auth.user);
  if (!identity.ok) return jsonResponse({ error: identity.error, mismatches: identity.mismatches ?? [] }, identity.status);

  const profile = identity.profile ?? {};
  const contact = [String(profile?.phone ?? "").trim(), String(auth.user.email ?? "").trim()].filter(Boolean).join(" | ");
  const sellerName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Vendedor";
  const monthly = parsed.data.publication_type === "monthly";
  if (parsed.data.delivery_methods?.includes("retiro")) {
    parsed.data.pickup_address = String(profile?.address ?? "").trim() || null;
    if (!parsed.data.pickup_address) return jsonResponse({ error: "Completá la dirección en Mis datos." }, 409);
  } else {
    parsed.data.pickup_address = null;
  }
  const { data, error } = await supabaseAdmin.from("products").insert({
    ...parsed.data,
    user_id: auth.user.id,
    currency: "ARS",
    contact,
    seller_name: sellerName,
    publication_status: "pending_payment",
    publication_started_at: null,
    publication_expires_at: null,
  }).select("id,publication_type,publication_status").single();
  if (error) {
    console.error("[products] create failed", { code: error.code, message: error.message });
    return jsonResponse({ error: "No se pudo crear la publicación." }, 500);
  }
  return jsonResponse({ product: data, requires_payment: monthly }, 201);
};
