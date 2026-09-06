/* Cliente del listado operativo de ventas: filtros y paginación se resuelven en el servidor. */
const normalizePagination = (value) => ({
  page: Math.max(1, Number(value?.page) || 1),
  pageSize: Math.max(1, Number(value?.pageSize) || 3),
  total: Math.max(0, Number(value?.total) || 0),
  totalPages: Math.max(0, Number(value?.totalPages) || 0),
});

export const fetchSalesList = async (token, { from = "", to = "", pendingOnly = false, page = 1 } = {}) => {
  const safeToken = String(token ?? "").trim();
  if (!safeToken) return { items: [], pagination: normalizePagination(), error: "" };

  const params = new URLSearchParams({ page: String(Math.max(1, Number(page) || 1)), page_size: "3" });
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(from))) params.set("from", from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) params.set("to", to);
  if (pendingOnly) params.set("pending", "1");

  const response = await fetch(`/api/my-sales-list?${params.toString()}`, {
    headers: { Authorization: `Bearer ${safeToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { items: [], pagination: normalizePagination(), error: String(payload?.error ?? "No se pudieron cargar las ventas.") };
  }
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    pagination: normalizePagination(payload?.pagination),
    error: String(payload?.error ?? ""),
  };
};
