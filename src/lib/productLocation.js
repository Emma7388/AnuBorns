export const ALL_PRODUCT_LOCATIONS = "TODAS";

export const PRODUCT_LOCATION_OPTIONS = [
  { value: "CAMPANA", label: "Campana" },
  { value: "ZARATE", label: "Zárate" },
  { value: "LIMA", label: "Lima" },
];

const normalizeLocation = (value) => String(value ?? "").trim().toUpperCase();

export const normalizeProductLocation = (value) => {
  const normalized = normalizeLocation(value);
  if (normalized === ALL_PRODUCT_LOCATIONS) return normalized;
  return PRODUCT_LOCATION_OPTIONS.some((option) => option.value === normalized) ? normalized : "";
};

export const formatProductLocation = (value, fallback = "Sin especificar") => {
  const normalized = normalizeLocation(value);
  if (!normalized) return fallback;
  if (normalized === ALL_PRODUCT_LOCATIONS) {
    return PRODUCT_LOCATION_OPTIONS.map((item) => item.label).join(", ");
  }
  return PRODUCT_LOCATION_OPTIONS.find((item) => item.value === normalized)?.label ?? String(value).trim();
};

export const productMatchesLocation = (productLocation, requestedLocation) => {
  const requested = normalizeLocation(requestedLocation);
  if (!requested) return true;
  const product = normalizeLocation(productLocation);
  return product === ALL_PRODUCT_LOCATIONS || product === requested;
};
