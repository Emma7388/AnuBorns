import { getSupabaseAdmin } from "./supabaseServer.js";

const ALLOWED_ORDER_STATUSES = new Set(["approved", "pending"]);
const DAYS_WINDOW = 7;
const MAX_ITEMS = 10;
const QUERY_TIMEOUT_MS = 6_000;

const toSafeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const logSupabaseError = (context, error) => {
  console.error(`[featured-products] ${context}`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });
};

const createTimeoutSignal = () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  return { signal: controller.signal, timeout };
};

const runWithTimeout = async (query) => {
  const timeout = createTimeoutSignal();
  try {
    return await query.abortSignal(timeout.signal);
  } finally {
    clearTimeout(timeout.timeout);
  }
};

export const getFeaturedProducts = async () => {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return { items: [], error: "Servicio no disponible." };
  }

  const fromDate = new Date(Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error: rowsError } = await runWithTimeout(
    supabaseAdmin
      .from("order_items")
      .select("product_id, qty, unit_price, orders!inner(created_at, status)")
      .gte("orders.created_at", fromDate)
      .in("orders.status", [...ALLOWED_ORDER_STATUSES])
  );

  if (rowsError) {
    logSupabaseError("Order items query failed", rowsError);
    return { items: [], error: "No se pudieron cargar destacados." };
  }

  const aggregate = new Map();
  (rows ?? []).forEach((row) => {
    const productId = String(row?.product_id ?? "").trim();
    if (!productId) return;
    const orderStatus = String(row?.orders?.status ?? "").trim().toLowerCase();
    if (!ALLOWED_ORDER_STATUSES.has(orderStatus)) return;
    const qty = Math.max(1, toSafeNumber(row?.qty, 1));
    const unitPrice = Math.max(0, toSafeNumber(row?.unit_price, 0));
    const current = aggregate.get(productId) ?? { soldQty: 0, revenue: 0 };
    current.soldQty += qty;
    current.revenue += unitPrice * qty;
    aggregate.set(productId, current);
  });

  const productIds = [...aggregate.keys()];
  if (productIds.length === 0) {
    return { items: [], error: "" };
  }

  const { data: products, error: productsError } = await runWithTimeout(
    supabaseAdmin
      .from("products")
      .select("id, title, description, price, currency, image_url, seller_name, user_id, delivery_methods")
      .in("id", productIds)
  );

  if (productsError) {
    logSupabaseError("Products query failed", productsError);
    return { items: [], error: "No se pudieron cargar destacados." };
  }

  const items = (products ?? [])
    .map((product) => {
      const productId = String(product?.id ?? "").trim();
      const metrics = aggregate.get(productId);
      if (!metrics) return null;
      return {
        productId,
        title: String(product?.title ?? "Producto"),
        description: String(product?.description ?? "").trim(),
        price: toSafeNumber(product?.price, 0),
        currency: String(product?.currency ?? "ARS"),
        imageUrl: String(product?.image_url ?? "").trim() || "/logo2.svg",
        sellerName: String(product?.seller_name ?? "Proveedor"),
        sellerUserId: String(product?.user_id ?? "").trim(),
        deliveryMethods: Array.isArray(product?.delivery_methods)
          ? product.delivery_methods.map((item) => String(item ?? "").trim().toLowerCase()).filter(Boolean)
          : [],
        soldQty: metrics.soldQty,
        revenue: metrics.revenue,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.soldQty !== a.soldQty) return b.soldQty - a.soldQty;
      return b.revenue - a.revenue;
    })
    .slice(0, MAX_ITEMS);

  return { items, error: "" };
};
