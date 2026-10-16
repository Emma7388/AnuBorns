import { jsonResponse } from "../../../lib/apiResponse.js";
import { sanitizeProductInput } from "../../../lib/productInput.js";
import { readJsonBody } from "../../../lib/serverRequest.js";
import { checkRateLimit } from "../../../lib/serverRateLimit.js";
import { getAuthenticatedUser } from "../../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../../lib/supabaseServer.js";
import { validateSellerMercadoPagoIdentity } from "../../../lib/mercadopagoIdentity.js";
import { PRODUCT_IMAGE_BUCKET, getOwnedProductImagePath, getProductImageUrls, validateOwnedProductImageUrls } from "../../../lib/productImages.js";

const getOwnedProduct = async (supabaseAdmin, userId, id) => {
  const { data } = await supabaseAdmin.from("products").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return data ?? null;
};

export const GET = async ({ request, params }) => {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);
  const auth = await getAuthenticatedUser(supabaseAdmin, request);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const product = await getOwnedProduct(supabaseAdmin, auth.user.id, params.id);
  return product ? jsonResponse({ product }) : jsonResponse({ error: "Publicación no encontrada." }, 404);
};

export const PATCH = async ({ request, params }) => {
  const rate = await checkRateLimit({ request, routeKey: "products-update", windowMs: 60_000, max: 20 });
  if (!rate.allowed) return jsonResponse({ error: "Demasiadas solicitudes." }, 429);
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);
  const auth = await getAuthenticatedUser(supabaseAdmin, request);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const existing = await getOwnedProduct(supabaseAdmin, auth.user.id, params.id);
  if (!existing) return jsonResponse({ error: "Publicación no encontrada." }, 404);
  const body = await readJsonBody(request, { maxBytes: 30_000 });
  if (!body.ok) return jsonResponse({ error: body.error }, body.status);
  const parsed = sanitizeProductInput(body.data, { partial: true });
  if (!parsed.ok || Object.keys(parsed.data).length === 0) return jsonResponse({ error: parsed.errors[0] ?? "No hay cambios válidos." }, 400);
  delete parsed.data.publication_type;
  const identity = await validateSellerMercadoPagoIdentity(supabaseAdmin, auth.user);
  if (!identity.ok) return jsonResponse({ error: identity.error }, identity.status);
  const requestedImages = getProductImageUrls(parsed.data);
  if (requestedImages.length > 0 && !validateOwnedProductImageUrls(requestedImages, { userId: auth.user.id, productId: params.id })) {
    return jsonResponse({ error: "La imagen no pertenece a esta publicación." }, 400);
  }
  if (parsed.data.delivery_methods?.includes("retiro")) {
    parsed.data.pickup_address = String(identity.profile?.address ?? "").trim() || null;
    if (!parsed.data.pickup_address) return jsonResponse({ error: "Completá la dirección en Mis datos." }, 409);
  } else if (parsed.data.delivery_methods) {
    parsed.data.pickup_address = null;
  }
  if (
    existing.publication_type === "permanent"
    && existing.publication_status === "pending_payment"
    && parsed.data.image_url
  ) {
    parsed.data.publication_status = "active";
    parsed.data.publication_started_at = new Date().toISOString();
  }
  const { data, error } = await supabaseAdmin.from("products").update(parsed.data).eq("id", params.id).eq("user_id", auth.user.id).select("*").single();
  if (error) return jsonResponse({ error: "No se pudo editar la publicación." }, 500);
  if (requestedImages.length > 0) {
    const retained = new Set(requestedImages);
    const oldPaths = getProductImageUrls(existing)
      .filter((url) => !retained.has(url))
      .map((url) => getOwnedProductImagePath(url, { userId: auth.user.id, productId: params.id }))
      .filter(Boolean);
    if (oldPaths.length > 0) await supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).remove(oldPaths);
  }
  return jsonResponse({ product: data });
};

export const DELETE = async ({ request, params }) => {
  const rate = await checkRateLimit({ request, routeKey: "products-delete", windowMs: 60_000, max: 20 });
  if (!rate.allowed) return jsonResponse({ error: "Demasiadas solicitudes." }, 429);
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);
  const auth = await getAuthenticatedUser(supabaseAdmin, request);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const product = await getOwnedProduct(supabaseAdmin, auth.user.id, params.id);
  if (!product) return jsonResponse({ error: "Publicación no encontrada." }, 404);
  const [{ count: orderCount }, { count: publicationPaymentCount }] = await Promise.all([
    supabaseAdmin.from("order_items")
      .select("order_id,orders!inner(status)", { count: "exact", head: true })
      .eq("product_id", params.id)
      .in("orders.status", ["pending", "refund_pending"]),
    supabaseAdmin.from("product_publication_payments")
      .select("id", { count: "exact", head: true })
      .eq("product_id", params.id)
      .eq("status", "pending"),
  ]);
  if ((orderCount ?? 0) > 0 || (publicationPaymentCount ?? 0) > 0) {
    return jsonResponse({ error: "No podés borrar un producto que tiene un pago pendiente." }, 409);
  }
  const { error: cartError } = await supabaseAdmin.from("cart_items").delete().eq("product_id", params.id);
  if (cartError) return jsonResponse({ error: "No se pudo quitar el producto de los carritos." }, 500);
  await supabaseAdmin.from("product_checkout_reservations").delete().eq("product_id", params.id);
  const { error } = await supabaseAdmin.from("products").delete().eq("id", params.id).eq("user_id", auth.user.id);
  if (error) return jsonResponse({ error: "No se pudo borrar la publicación." }, 500);
  const imagePaths = getProductImageUrls(product)
    .map((url) => getOwnedProductImagePath(url, { userId: auth.user.id, productId: params.id }))
    .filter(Boolean);
  if (imagePaths.length > 0) await supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).remove(imagePaths);
  return jsonResponse({ ok: true });
};
