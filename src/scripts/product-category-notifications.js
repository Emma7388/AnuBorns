import { supabase } from "../lib/supabaseClient";

const STORAGE_KEY = "ab_seen_products_by_category_v1";

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

const readSeenMap = async (userId) => {
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

const writeSeenMap = async (userId, value) => {
  if (!userId) return;
  try {
    const key = getStorageKey(userId);
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
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
    .select("created_at, categories!inner(slug)")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error || !Array.isArray(data)) return {};

  const latestByCategory = {};
  data.forEach((product) => {
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
  const userId = await getSessionUserId();
  if (!userId) {
    applyDots([]);
    return;
  }

  const latestByCategory = await fetchLatestByCategory().catch(() => ({}));
  const seenMap = await readSeenMap(userId);
  const currentSlug = getCurrentCategorySlug();

  if (currentSlug && latestByCategory[currentSlug]) {
    seenMap[currentSlug] = latestByCategory[currentSlug];
    await writeSeenMap(userId, seenMap);
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
