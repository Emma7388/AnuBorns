const SOLD_ORDER_STATUSES = ["approved"];

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
    .from("order_items")
    .select("product_id, orders!inner(status)")
    .in("product_id", ids)
    .in("orders.status", SOLD_ORDER_STATUSES);

  if (error) {
    throw error;
  }

  return new Set(
    (data ?? [])
      .map((row) => String(row?.product_id ?? "").trim())
      .filter(Boolean),
  );
};

export const filterAvailableProducts = async (supabaseAdmin, products = []) => {
  const safeProducts = Array.isArray(products) ? products : [];
  if (safeProducts.length === 0) return safeProducts;

  const soldProductIds = await getSoldProductIds(
    supabaseAdmin,
    safeProducts.map((product) => product?.id),
  );
  if (soldProductIds.size === 0) return safeProducts;

  return safeProducts.filter((product) => !soldProductIds.has(String(product?.id ?? "").trim()));
};
