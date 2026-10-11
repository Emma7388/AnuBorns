/* Calcula la comisión sobre el subtotal de productos, nunca sobre logística. */
export const calculateMarketplaceFee = (
  productSubtotal,
  { fixedAmount = 0, percent = 0 } = {},
) => {
  const subtotal = Number(productSubtotal);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;

  const fixed = Number(fixedAmount);
  if (Number.isFinite(fixed) && fixed > 0) {
    return Math.min(Math.round(fixed), subtotal);
  }

  const rate = Number(percent);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.min(subtotal, Math.round(subtotal * (rate / 100)));
};
