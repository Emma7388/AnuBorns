const clean = (value) => String(value ?? "").trim();
const digits = (value) => clean(value).replace(/\D+/g, "");

// Solo usamos la identidad guardada en la compra o el producto exacto.
export const resolvePurchaseProvider = (item, products = {}) => {
  const productId = clean(item?.product_id);
  const savedUserId = clean(item?.provider_user_id);
  const product = products[productId];
  const productUserId = clean(product?.user_id);
  const matchesSeller = !savedUserId || savedUserId === productUserId;
  return {
    userId: savedUserId || productUserId,
    phone: digits(item?.provider_whatsapp) || (matchesSeller ? digits(product?.contact) : ""),
    productId,
  };
};

export const purchaseProviderGroupKey = (item, products, index) => {
  const provider = resolvePurchaseProvider(item, products);
  if (provider.userId) return `user:${provider.userId}`;
  if (provider.productId) return `product:${provider.productId}`;
  return `item:${index}`;
};
