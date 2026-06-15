/* Cliente con cache corta para el resumen de ventas del header y Mis ventas. */
const CACHE_TTL_MS = 5000;

/* Store global por pestaña: comparte payload/promesa entre navegaciones Astro. */
const getStore = () => {
  if (typeof window === "undefined") {
    return { tokenKey: "", fetchedAt: 0, payload: null, promise: null };
  }
  window.__abSalesSummaryStore ??= {
    tokenKey: "",
    fetchedAt: 0,
    payload: null,
    promise: null,
  };
  return window.__abSalesSummaryStore;
};

/* Normaliza respuestas del endpoint para evitar checks repetidos en la UI. */
const normalizePayload = (payload) => ({
  items: Array.isArray(payload?.items) ? payload.items : [],
  error: String(payload?.error ?? ""),
});

/* Trae ventas del usuario y deduplica requests simultáneas por token. */
export const fetchSalesSummary = async (token, { force = false } = {}) => {
  const safeToken = String(token ?? "").trim();
  if (!safeToken) return { items: [], error: "" };

  const store = getStore();
  const tokenKey = safeToken.slice(-16);
  const now = Date.now();

  /* Cache caliente: evita reconsultas al navegar o refrescar el header. */
  if (
    !force &&
    store.payload &&
    store.tokenKey === tokenKey &&
    now - store.fetchedAt < CACHE_TTL_MS
  ) {
    return store.payload;
  }

  /* Si ya hay una consulta en curso para el mismo token, se reutiliza. */
  if (!force && store.promise && store.tokenKey === tokenKey) {
    return store.promise;
  }

  store.tokenKey = tokenKey;
  store.promise = fetch("/api/my-sales-products", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${safeToken}`,
    },
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { items: [], error: String(payload?.error ?? "No se pudieron cargar las ventas.") };
      }
      return normalizePayload(payload);
    })
    .then((payload) => {
      store.payload = payload;
      store.fetchedAt = Date.now();
      return payload;
    })
    .finally(() => {
      store.promise = null;
    });

  return store.promise;
};

/* Invalida cache cuando una acción de ventas cambia datos relevantes. */
export const invalidateSalesSummaryCache = () => {
  const store = getStore();
  store.fetchedAt = 0;
  store.payload = null;
  store.promise = null;
};
