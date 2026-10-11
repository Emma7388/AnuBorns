export const PRODUCT_IMAGE_BUCKET = "product-images";

const getSupabaseOrigin = () => {
  const raw = String(process.env.SUPABASE_URL ?? import.meta.env?.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? import.meta.env?.PUBLIC_SUPABASE_URL ?? "").trim();
  try { return new URL(raw).origin; } catch { return ""; }
};

export const getOwnedProductImagePath = (value, { userId, productId, supabaseOrigin = getSupabaseOrigin() } = {}) => {
  const safeUserId = String(userId ?? "").trim();
  const safeProductId = String(productId ?? "").trim();
  if (!value || !safeUserId || !safeProductId || !supabaseOrigin) return "";
  try {
    const url = new URL(String(value));
    if (url.origin !== supabaseOrigin) return "";
    const marker = `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;
    if (!url.pathname.startsWith(marker)) return "";
    const path = decodeURIComponent(url.pathname.slice(marker.length));
    const expectedPrefix = `${safeUserId}/${safeProductId}/`;
    if (!path.startsWith(expectedPrefix) || path.includes("..")) return "";
    return path;
  } catch {
    return "";
  }
};

export const getProductImageUrls = (product = {}) => {
  const urls = Array.isArray(product?.image_urls) ? product.image_urls : [];
  return [...new Set([product?.image_url, ...urls].map((item) => String(item ?? "").trim()).filter(Boolean))];
};

export const validateOwnedProductImageUrls = (urls, context) => {
  const safeUrls = (Array.isArray(urls) ? urls : []).map((item) => String(item ?? "").trim()).filter(Boolean);
  return safeUrls.length > 0 && safeUrls.every((url) => Boolean(getOwnedProductImagePath(url, context)));
};
