/* Preferencias locales de envío por proveedor para carrito y checkout. */
export const SHIPPING_FEE = 5000;

const SHIPPING_KEY = "ab_shipping_preference_v1";

/* Preferencia vacía usada como valor seguro por defecto. */
const emptyPreference = () => ({ requested: false, address: "", city: "" });

/* Normaliza datos leídos desde localStorage. */
const normalizePreference = (value) => ({
  requested: Boolean(value?.requested),
  address: String(value?.address ?? "").trim(),
  city: String(value?.city ?? "").trim(),
});

/* Lee el storage tolerando JSON corrupto o entornos sin window. */
const readRawPreference = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SHIPPING_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

/* Notifica cambios una sola vez por window para evitar renders duplicados. */
const emitShippingPreferenceUpdate = (detail) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ab-shipping-preference-updated", { detail }));
};

/* API legacy de preferencia simple. */
export const getShippingPreference = () => {
  if (typeof window === "undefined") return emptyPreference();
  return normalizePreference(readRawPreference());
};

/* Guarda preferencia simple y avisa a la UI. */
export const setShippingPreference = (preference) => {
  if (typeof window === "undefined") return;
  const next = normalizePreference(preference);
  window.localStorage.setItem(SHIPPING_KEY, JSON.stringify(next));
  emitShippingPreferenceUpdate(next);
};

/* Devuelve preferencias agrupadas por proveedor. */
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

/* Preferencia segura para un proveedor puntual. */
export const getProviderShippingPreference = (providerKey) =>
  getProviderShippingPreferences()[providerKey] ?? emptyPreference();

/* Guarda o actualiza la preferencia de envío de un proveedor. */
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

/* Elimina preferencias de proveedores que ya no están en el carrito. */
export const clearUnavailableProviderShippingPreferences = (activeProviderKeys) => {
  if (typeof window === "undefined") return;
  const active = new Set(activeProviderKeys);
  const groups = getProviderShippingPreferences();
  const nextGroups = Object.fromEntries(Object.entries(groups).filter(([key]) => active.has(key)));
  window.localStorage.setItem(SHIPPING_KEY, JSON.stringify({ groups: nextGroups }));
};

/* Lista solo los proveedores que solicitaron envío. */
export const getRequestedProviderShippingPreferences = () =>
  Object.entries(getProviderShippingPreferences())
    .filter(([, preference]) => preference.requested)
    .map(([providerKey, preference]) => ({ providerKey, ...preference }));

/* Limpia preferencias de forma idempotente para no disparar loops de render. */
export const clearShippingPreference = () => {
  if (typeof window === "undefined") return;
  if (!window.localStorage.getItem(SHIPPING_KEY)) return;
  window.localStorage.removeItem(SHIPPING_KEY);
  emitShippingPreferenceUpdate();
};

/* Normaliza métodos de entrega para comparar retiro/envío. */
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

/* Determina si un item permite envío a domicilio. */
export const itemSupportsShipping = (item) =>
  normalizeDeliveryMethods(item?.product?.delivery_methods).includes("envio");
