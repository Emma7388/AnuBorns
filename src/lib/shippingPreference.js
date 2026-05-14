export const SHIPPING_FEE = 5000;

const SHIPPING_KEY = "ab_shipping_preference_v1";

const emptyPreference = () => ({ requested: false, address: "", city: "" });

const normalizePreference = (value) => ({
  requested: Boolean(value?.requested),
  address: String(value?.address ?? "").trim(),
  city: String(value?.city ?? "").trim(),
});

const readRawPreference = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SHIPPING_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const emitShippingPreferenceUpdate = (detail) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ab-shipping-preference-updated", { detail }));
  document.dispatchEvent(new CustomEvent("ab-shipping-preference-updated", { detail }));
};

export const getShippingPreference = () => {
  if (typeof window === "undefined") return emptyPreference();
  return normalizePreference(readRawPreference());
};

export const setShippingPreference = (preference) => {
  if (typeof window === "undefined") return;
  const next = normalizePreference(preference);
  window.localStorage.setItem(SHIPPING_KEY, JSON.stringify(next));
  emitShippingPreferenceUpdate(next);
};

export const getProviderShippingPreferences = () => {
  const parsed = readRawPreference();
  const rawGroups = parsed?.groups && typeof parsed.groups === "object" ? parsed.groups : {};
  return Object.fromEntries(
    Object.entries(rawGroups).map(([key, value]) => [
      key,
      {
        ...normalizePreference(value),
        provider: String(value?.provider ?? "").trim(),
      },
    ]),
  );
};

export const getProviderShippingPreference = (providerKey) =>
  getProviderShippingPreferences()[providerKey] ?? emptyPreference();

export const setProviderShippingPreference = (providerKey, preference) => {
  if (typeof window === "undefined" || !providerKey) return;
  const groups = getProviderShippingPreferences();
  const next = {
    groups: {
      ...groups,
      [providerKey]: {
        ...normalizePreference(preference),
        provider: String(preference?.provider ?? groups[providerKey]?.provider ?? "").trim(),
      },
    },
  };
  window.localStorage.setItem(SHIPPING_KEY, JSON.stringify(next));
  emitShippingPreferenceUpdate(next);
};

export const clearUnavailableProviderShippingPreferences = (activeProviderKeys) => {
  if (typeof window === "undefined") return;
  const active = new Set(activeProviderKeys);
  const groups = getProviderShippingPreferences();
  const nextGroups = Object.fromEntries(Object.entries(groups).filter(([key]) => active.has(key)));
  window.localStorage.setItem(SHIPPING_KEY, JSON.stringify({ groups: nextGroups }));
};

export const getRequestedProviderShippingPreferences = () =>
  Object.entries(getProviderShippingPreferences())
    .filter(([, preference]) => preference.requested)
    .map(([providerKey, preference]) => ({ providerKey, ...preference }));

export const clearShippingPreference = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SHIPPING_KEY);
  emitShippingPreferenceUpdate();
};

export const normalizeDeliveryMethods = (value) => {
  const normalizeItem = (item) =>
    String(item ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

  if (Array.isArray(value)) return value.map(normalizeItem).filter(Boolean);
  return String(value ?? "")
    .split(/[,+]/)
    .map(normalizeItem)
    .filter(Boolean);
};

export const itemSupportsShipping = (item) =>
  normalizeDeliveryMethods(item?.product?.delivery_methods).includes("envio");
