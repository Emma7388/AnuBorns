import { supabase } from "../lib/supabaseClient";

const STORAGE_KEY = "ab_seen_products_by_category_v1";
let notificationSyncId = 0;

const getCurrentCategorySlug = () => {
  const match = window.location.pathname.match(/^\/comprar\/productos\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : "";
};

const getSessionUserId = async () => {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? "";
  } catch {
    return "";
  }
};

const getStorageKey = (userId) => `${STORAGE_KEY}:${userId}`;

const readSeenMap = (userId) => {
  if (!userId) return {};
  try {
    const key = getStorageKey(userId);
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeSeenMap = (userId, value) => {
  if (!userId) return;
  try {
    const key = getStorageKey(userId);
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignora errores de storage para no interrumpir la navegación.
  }
};

const extractCategorySlug = (product) => {
  if (Array.isArray(product?.categories) && product.categories[0]?.slug) {
    return String(product.categories[0].slug).trim();
  }
  if (product?.categories?.slug) {
    return String(product.categories.slug).trim();
  }
  return "";
};

const fetchLatestByCategory = async () => {
  const { data, error } = await supabase
    .from("products")
    .select("id, created_at, categories!inner(slug)")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error || !Array.isArray(data)) return {};

  // Usa la misma disponibilidad que el catálogo: una venta aprobada oculta el producto.
  const soldIds = new Set();
  for (let offset = 0; offset < data.length; offset += 100) {
    const response = await fetch("/api/sold-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_ids: data.slice(offset, offset + 100).map((product) => product.id) }),
    });
    if (!response.ok) throw new Error("No se pudo validar disponibilidad.");
    const payload = await response.json();
    if (!Array.isArray(payload.sold_product_ids)) throw new Error("Disponibilidad inválida.");
    payload.sold_product_ids.forEach((id) => soldIds.add(String(id)));
  }

  const latestByCategory = {};
  data.forEach((product) => {
    if (soldIds.has(String(product.id))) return;
    const slug = extractCategorySlug(product);
    const createdAt = String(product?.created_at ?? "").trim();
    if (!slug || !createdAt || latestByCategory[slug]) return;
    latestByCategory[slug] = createdAt;
  });
  return latestByCategory;
};

const applyDots = (unseenSlugs) => {
  const unseen = new Set(unseenSlugs);
  document.querySelectorAll("[data-category-dot]").forEach((dot) => {
    const slug = String(dot.getAttribute("data-category-dot") ?? "").trim();
    dot.classList.toggle("ab-is-hidden", !unseen.has(slug));
  });

  const hasAny = unseen.size > 0;
  document.querySelectorAll("[data-products-dot]").forEach((dot) => {
    dot.classList.toggle("ab-is-hidden", !hasAny);
  });
};

const syncProductCategoryNotifications = async () => {
  const syncId = ++notificationSyncId;
  const currentSlug = getCurrentCategorySlug();
  const userId = await getSessionUserId();
  if (syncId !== notificationSyncId) return;
  if (!userId) {
    applyDots([]);
    return;
  }

  const latestByCategory = await fetchLatestByCategory().catch(() => ({}));
  if (syncId !== notificationSyncId || currentSlug !== getCurrentCategorySlug()) return;
  const seenMap = readSeenMap(userId);

  if (currentSlug && latestByCategory[currentSlug]) {
    const latestAt = latestByCategory[currentSlug];
    if (!(new Date(seenMap[currentSlug]).getTime() >= new Date(latestAt).getTime())) {
      seenMap[currentSlug] = latestAt;
      writeSeenMap(userId, seenMap);
    }
  }

  const unseenSlugs = Object.entries(latestByCategory)
    .filter(([slug, createdAt]) => {
      const seenAt = String(seenMap[slug] ?? "").trim();
      if (!seenAt) return true;
      return new Date(createdAt).getTime() > new Date(seenAt).getTime();
    })
    .map(([slug]) => slug)
    .filter((slug) => slug !== currentSlug);

  applyDots(unseenSlugs);
};

const bindProductCategoryNotificationEvents = () => {
  if (document.documentElement.dataset.abProductCategoryNotificationsBound === "true") return;
  document.documentElement.dataset.abProductCategoryNotificationsBound = "true";

  document.addEventListener("astro:page-load", syncProductCategoryNotifications);
  document.addEventListener("astro:after-swap", syncProductCategoryNotifications);
  window.addEventListener("pageshow", syncProductCategoryNotifications);
  window.addEventListener("storage", (event) => {
    if (!event.key || !event.key.includes(STORAGE_KEY)) return;
    syncProductCategoryNotifications();
  });

  supabase.auth.onAuthStateChange(() => {
    syncProductCategoryNotifications();
  });
};

syncProductCategoryNotifications();
bindProductCategoryNotificationEvents();
