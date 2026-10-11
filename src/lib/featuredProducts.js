/* Consulta productos disponibles de vendedores destacados por ventas aprobadas. */
import { getSupabaseAdmin } from "./supabaseServer.js";
import { filterAvailableProducts } from "./soldProducts.js";

const ALLOWED_ORDER_STATUSES = new Set(["approved"]);
const MAX_ITEMS = 10;
const SELLER_QUERY_LIMIT = 20;
const PRODUCTS_QUERY_LIMIT = 80;
const QUERY_TIMEOUT_MS = 6_000;

/* Convierte valores externos a números seguros para métricas. */
const toSafeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

/* Registro estructurado para diagnosticar errores de Supabase sin exponer datos sensibles. */
const logSupabaseError = (context, error) => {
  console.error(`[featured-products] ${context}`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });
};

/* AbortController evita que una consulta lenta deje colgada la página. */
const createTimeoutSignal = () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  return { signal: controller.signal, timeout };
};

/* Ejecuta queries PostgREST con timeout compartido. */
const runWithTimeout = async (query) => {
  const timeout = createTimeoutSignal();
  try {
    return await query.abortSignal(timeout.signal);
  } finally {
    clearTimeout(timeout.timeout);
  }
};

const toFeaturedItem = (product) => ({
  productId: String(product?.id ?? "").trim(),
  title: String(product?.title ?? "Producto"),
  description: String(product?.description ?? "").trim(),
  price: toSafeNumber(product?.price, 0),
  currency: String(product?.currency ?? "ARS"),
  imageUrl: String(product?.image_url ?? "").trim() || "/logo2.svg",
  location: String(product?.location ?? "").trim(),
  pickupAddress: String(product?.pickup_address ?? "").trim(),
  createdAt: String(product?.created_at ?? "").trim(),
  sellerName: String(product?.seller_name ?? "Proveedor"),
  sellerUserId: String(product?.user_id ?? "").trim(),
  deliveryMethods: Array.isArray(product?.delivery_methods)
    ? product.delivery_methods.map((item) => String(item ?? "").trim().toLowerCase()).filter(Boolean)
    : [],
  stock: Math.max(0, Number(product?.stock ?? 0)),
  publicationType: String(product?.publication_type ?? "permanent"),
  publicationExpiresAt: product?.publication_expires_at ?? null,
});

const buildSellerRanking = async (supabaseAdmin) => {
  const { data: salesRows, error: salesError } = await runWithTimeout(
    supabaseAdmin
      .from("order_items")
      .select("product_id, seller_user_id, provider, qty, unit_price, orders!inner(status)")
      .in("orders.status", [...ALLOWED_ORDER_STATUSES]),
  );

  if (salesError) {
    logSupabaseError("Sales query failed", salesError);
    return { sellers: [], error: "No se pudieron cargar destacados." };
  }

  const sellerMap = new Map();

  (salesRows ?? []).forEach((row) => {
    const orderStatus = String(row?.orders?.status ?? "").trim().toLowerCase();
    const seller = {
      sellerUserId: String(row?.seller_user_id ?? "").trim(),
      sellerName: String(row?.provider ?? "").trim(),
    };
    if (!seller.sellerUserId || !ALLOWED_ORDER_STATUSES.has(orderStatus)) return;

    const current = sellerMap.get(seller.sellerUserId) ?? {
      sellerUserId: seller.sellerUserId,
      sellerName: seller.sellerName || "Proveedor",
      soldQty: 0,
      revenue: 0,
    };
    const qty = Math.max(1, toSafeNumber(row?.qty, 1));
    current.soldQty += qty;
    current.revenue += Math.max(0, toSafeNumber(row?.unit_price, 0)) * qty;
    sellerMap.set(seller.sellerUserId, current);
  });

  return {
    sellers: [...sellerMap.values()]
      .sort((a, b) => {
        if (b.soldQty !== a.soldQty) return b.soldQty - a.soldQty;
        return b.revenue - a.revenue;
      })
      .slice(0, SELLER_QUERY_LIMIT),
    error: "",
  };
};

const getRecentAvailableProducts = async (supabaseAdmin) => {
  const { data: products, error } = await runWithTimeout(
    supabaseAdmin
      .from("products")
      .select("id, title, description, price, currency, image_url, location, pickup_address, seller_name, user_id, delivery_methods, stock, publication_type, publication_status, publication_expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(PRODUCTS_QUERY_LIMIT),
  );

  if (error) {
    logSupabaseError("Products query failed", error);
    return { items: [], error: "No se pudieron cargar destacados." };
  }

  const availableProducts = await filterAvailableProducts(supabaseAdmin, products ?? []);
  return { items: availableProducts.slice(0, MAX_ITEMS).map(toFeaturedItem), error: "" };
};

const getAvailableProductsForSellers = async (supabaseAdmin, sellers) => {
  const sellerIds = sellers.map((seller) => seller.sellerUserId).filter(Boolean);
  if (sellerIds.length === 0) return { items: [], error: "" };

  const { data: products, error } = await runWithTimeout(
    supabaseAdmin
      .from("products")
      .select("id, title, description, price, currency, image_url, location, pickup_address, seller_name, user_id, delivery_methods, stock, publication_type, publication_status, publication_expires_at, created_at")
      .in("user_id", sellerIds)
      .order("created_at", { ascending: false })
      .limit(PRODUCTS_QUERY_LIMIT),
  );

  if (error) {
    logSupabaseError("Seller products query failed", error);
    return { items: [], error: "No se pudieron cargar destacados." };
  }

  const sellerRank = new Map(sellers.map((seller, index) => [seller.sellerUserId, index]));
  const availableProducts = await filterAvailableProducts(supabaseAdmin, products ?? []);
  const items = availableProducts
    .sort((a, b) => {
      const aRank = sellerRank.get(String(a?.user_id ?? "").trim()) ?? Number.MAX_SAFE_INTEGER;
      const bRank = sellerRank.get(String(b?.user_id ?? "").trim()) ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return new Date(b?.created_at ?? 0).getTime() - new Date(a?.created_at ?? 0).getTime();
    })
    .slice(0, MAX_ITEMS)
    .map(toFeaturedItem);

  return { items, error: "" };
};

/* API interna consumida por endpoints/componentes de destacados. */
export const getFeaturedProducts = async () => {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return { items: [], error: "Servicio no disponible." };
  }

  try {
    const ranking = await buildSellerRanking(supabaseAdmin);
    if (ranking.error) return { items: [], error: ranking.error };

    const sellerProducts = await getAvailableProductsForSellers(supabaseAdmin, ranking.sellers);
    if (sellerProducts.error || sellerProducts.items.length > 0) return sellerProducts;

    return getRecentAvailableProducts(supabaseAdmin);
  } catch (error) {
    logSupabaseError("Featured sellers query failed", error);
    return { items: [], error: "No se pudieron cargar destacados." };
  }
};
