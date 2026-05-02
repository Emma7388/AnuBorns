const CACHE_TTL_MS = 5000;

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

const normalizePayload = (payload) => ({
  items: Array.isArray(payload?.items) ? payload.items : [],
  error: String(payload?.error ?? ""),
});

export const fetchSalesSummary = async (token, { force = false } = {}) => {
  const safeToken = String(token ?? "").trim();
  if (!safeToken) return { items: [], error: "" };

  const store = getStore();
  const tokenKey = safeToken.slice(-16);
  const now = Date.now();

  if (
    !force &&
    store.payload &&
    store.tokenKey === tokenKey &&
    now - store.fetchedAt < CACHE_TTL_MS
  ) {
    return store.payload;
  }

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

export const invalidateSalesSummaryCache = () => {
  const store = getStore();
  store.fetchedAt = 0;
  store.payload = null;
  store.promise = null;
};
