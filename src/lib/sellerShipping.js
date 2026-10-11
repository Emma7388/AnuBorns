/* Reglas compartidas para exponer a cada vendedor sólo su entrega. */
const LEGACY_PER_SELLER_SHIPPING_FEE = 5000;

const toNonNegativeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const normalizeProviderName = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/* Las órdenes nuevas guardan "Proveedor: dirección | Proveedor: dirección". */
const getGroupedShippingEntries = (shippingAddress) =>
  String(shippingAddress ?? "")
    .split("|")
    .map((part) => {
      const [provider, ...addressParts] = part.split(":");
      return {
        provider: addressParts.length > 0 ? normalizeProviderName(provider) : "",
        address: addressParts.join(":").trim(),
      };
    })
    .filter((entry) => entry.provider && entry.address);

const usesGroupedShippingFormat = (shippingAddress, shippingCity) =>
  normalizeProviderName(shippingCity) === "por proveedor" || String(shippingAddress ?? "").includes("|");

export const isSellerShippingRequested = ({ shippingRequested, shippingAddress, shippingCity, providerName }) => {
  if (!shippingRequested) return false;
  if (!usesGroupedShippingFormat(shippingAddress, shippingCity)) return true;
  const entries = getGroupedShippingEntries(shippingAddress);
  return entries.some((entry) => entry.provider === normalizeProviderName(providerName));
};

export const getSellerShippingDestination = ({ shippingAddress, shippingCity, providerName }) => {
  if (!usesGroupedShippingFormat(shippingAddress, shippingCity)) {
    return {
      address: String(shippingAddress ?? "").trim(),
      city: String(shippingCity ?? "").trim(),
    };
  }
  const entries = getGroupedShippingEntries(shippingAddress);
  const match = entries.find((entry) => entry.provider === normalizeProviderName(providerName));
  return { address: match?.address ?? "", city: "" };
};

/* Sólo reparte importes en órdenes históricas; las órdenes nuevas guardan costo cero. */
export const getSellerRecordedShippingCost = ({
  shippingRequested,
  orderShippingCost,
  shippingAddress,
  shippingCity,
  providerName,
}) => {
  if (!isSellerShippingRequested({ shippingRequested, shippingAddress, shippingCity, providerName })) return 0;
  const cost = toNonNegativeNumber(orderShippingCost);
  return Math.min(cost, LEGACY_PER_SELLER_SHIPPING_FEE);
};
