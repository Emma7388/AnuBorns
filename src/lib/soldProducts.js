import { PRODUCT_CONFIRMED_LOCKING_ORDER_STATUSES } from "./paymentStatus.js";

const SOLD_ORDER_STATUSES = [...PRODUCT_CONFIRMED_LOCKING_ORDER_STATUSES];

const normalizeProductIds = (productIds = []) =>
  [...new Set(
    (Array.isArray(productIds) ? productIds : [])
      .map((productId) => String(productId ?? "").trim())
      .filter(Boolean),
  )];

export const getSoldProductIds = async (supabaseAdmin, productIds = []) => {
  const ids = normalizeProductIds(productIds);
  if (!supabaseAdmin || ids.length === 0) return new Set();

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id,stock,publication_status,publication_type,publication_expires_at")
    .in("id", ids);

  if (error) {
    throw error;
  }

  return new Set(
    (data ?? [])
      .filter((row) => {
        if (Number(row?.stock ?? 0) < 1 || row?.publication_status !== "active") return true;
        return row?.publication_type === "monthly"
          && (!row?.publication_expires_at || Date.parse(row.publication_expires_at) <= Date.now());
      })
      .map((row) => String(row?.id ?? "").trim())
      .filter(Boolean),
  );
};

export const filterAvailableProducts = async (supabaseAdmin, products = []) => {
  const safeProducts = Array.isArray(products) ? products : [];
  if (safeProducts.length === 0) return safeProducts;

  const soldProductIds = new Set(safeProducts.filter((product) => {
    if ("stock" in product) {
      if (Number(product?.stock ?? 0) < 1 || product?.publication_status !== "active") return true;
      return product?.publication_type === "monthly"
        && (!product?.publication_expires_at || Date.parse(product.publication_expires_at) <= Date.now());
    }
    return false;
  }).map((product) => String(product?.id ?? "").trim()));
  if (safeProducts.some((product) => !("stock" in product))) {
    const legacy = await getSoldProductIds(supabaseAdmin, safeProducts.map((product) => product?.id));
    legacy.forEach((id) => soldProductIds.add(id));
  }
  if (soldProductIds.size === 0) return safeProducts;

  return safeProducts.filter((product) => !soldProductIds.has(String(product?.id ?? "").trim()));
};
