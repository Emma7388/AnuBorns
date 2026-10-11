/* Dependencias: cliente Supabase para persistir carrito cuando hay sesión. */
import { supabase } from "./supabaseClient";

/* Clave localStorage para carrito anónimo. */
const CART_KEY = "ab_cart_v1";
const CART_LOCAL_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 días
const CART_COUNT_CACHE_TTL_MS = 2500;
const CART_DATA_CACHE_TTL_MS = 1000;

const cartIdCache = new Map();
const cartIdRequests = new Map();
const cartCreationRequests = new Map();
const cartCountCache = new Map();
const cartCountRequests = new Map();
const cartDataCache = new Map();
const cartDataRequests = new Map();
const cartAddRequests = new Map();

const getUserCacheKey = (userId) => String(userId ?? "").trim();
const getCartAddRequestKey = (userId, productId) =>
  `${getUserCacheKey(userId) || "anonymous"}:${String(productId ?? "").trim()}`;

const clearCartComputedCache = (userId = "") => {
  const key = getUserCacheKey(userId);
  if (!key) {
    cartCountCache.clear();
    cartCountRequests.clear();
    cartDataCache.clear();
    cartDataRequests.clear();
    return;
  }

  cartCountCache.delete(key);
  cartCountRequests.delete(key);
  cartDataCache.delete(key);
  cartDataRequests.delete(key);
};

/* Dispara un evento global para que la interfaz reaccione a cambios de carrito. */
const emitCartUpdate = () => {
  if (typeof window === "undefined") return;
  clearCartComputedCache();
  const event = new CustomEvent("ab-cart-updated");
  window.dispatchEvent(event);
};

const emitOwnCartItemsRemoved = (count) => {
  if (typeof window === "undefined" || !count) return;
  const detail = { count: Number(count) || 0 };
  window.dispatchEvent(new CustomEvent("ab-cart-own-items-removed", { detail }));
};

const normalizeQuantity = (value, max = 100) => {
  const quantity = Math.floor(Number(value ?? 1));
  const safeMax = Math.max(1, Math.min(100, Math.floor(Number(max ?? 100)) || 100));
  return Math.max(1, Math.min(safeMax, Number.isFinite(quantity) ? quantity : 1));
};

/* Normaliza precios a números positivos. */
const normalizePrice = (value) => {
  const price = Number(value ?? 0);
  if (!Number.isFinite(price) || price < 0) return 0;
  return price;
};

const normalizeProductSnapshot = (value) => {
  if (!value || typeof value !== "object") return null;
  const title = String(value.title ?? value.name ?? "").trim();
  const imageUrl = String(value.image_url ?? value.image ?? "").trim();
  const sellerName = String(value.seller_name ?? value.provider ?? "").trim();
  const currency = String(value.currency ?? "ARS").trim() || "ARS";
  const deliveryMethods = Array.isArray(value.delivery_methods)
    ? value.delivery_methods.filter(Boolean).map((item) => String(item))
    : typeof value.delivery_methods === "string" && value.delivery_methods.trim()
      ? value.delivery_methods.trim()
      : null;

  if (!title && !imageUrl && !sellerName) return null;

  return {
    title: title || "Producto",
    image_url: imageUrl || "/logo2.svg",
    seller_name: sellerName || "N/A",
    currency,
    delivery_methods: deliveryMethods,
    stock: normalizeQuantity(value.stock ?? 1, 100),
  };
};

export const fetchSoldProductIds = async (productIds = []) => {
  const ids = [...new Set(
    (Array.isArray(productIds) ? productIds : [])
      .map((productId) => String(productId ?? "").trim())
      .filter(Boolean),
  )];
  if (ids.length === 0 || typeof fetch !== "function") return new Set();

  try {
    const response = await fetch("/api/sold-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_ids: ids }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return new Set();
    return new Set(
      (Array.isArray(payload?.sold_product_ids) ? payload.sold_product_ids : [])
        .map((productId) => String(productId ?? "").trim())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
};

export const isProductSold = async (productId) => {
  const productIds = await fetchSoldProductIds([productId]);
  return productIds.has(String(productId ?? "").trim());
};

const splitSoldProductsFromItems = async (items = []) => {
  const soldProductIds = await fetchSoldProductIds(items.map((item) => item.product_id));
  if (soldProductIds.size === 0) return { availableItems: items, removedCount: 0 };
  const availableItems = items.filter((item) => !soldProductIds.has(String(item.product_id ?? "").trim()));
  return {
    availableItems,
    removedCount: items.length - availableItems.length,
  };
};

/* Lee el carrito local y lo limpia de datos inválidos. */
const loadLocalCart = () => {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    let items = [];
    let updatedAt = 0;

    if (Array.isArray(parsed)) {
      /* Compatibilidad con formato legacy: array directo. */
      items = parsed;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.items)
    ) {
      items = parsed.items;
      updatedAt = Number(parsed.updatedAt ?? 0);
    }

    if (updatedAt > 0 && Date.now() - updatedAt > CART_LOCAL_TTL_MS) {
      window.localStorage.removeItem(CART_KEY);
      return [];
    }

    const normalizedItems = items
      .map((item) => ({
        product_id: String(item?.product_id ?? ""),
        quantity: normalizeQuantity(item?.quantity, item?.product_snapshot?.stock ?? 100),
        price_snapshot: normalizePrice(item?.price_snapshot),
        product_snapshot: normalizeProductSnapshot(item?.product_snapshot),
      }))
      .filter((item) => item.product_id && item.quantity > 0);

    /* Sanea carritos legacy o dañados: un producto sólo puede aparecer una vez. */
    return [...new Map(normalizedItems.map((item) => [item.product_id, item])).values()];
  } catch {
    return [];
  }
};

export const getCartCount = async (knownUserId = null) => {
  const userId = typeof knownUserId === "string" ? knownUserId : await getSessionUserId();
  if (!userId) return loadLocalCart().reduce((sum, item) => sum + normalizeQuantity(item.quantity), 0);

  try {
    const cacheKey = getUserCacheKey(userId);
    const cached = cartCountCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CART_COUNT_CACHE_TTL_MS) {
      return cached.count;
    }

    const pending = cartCountRequests.get(cacheKey);
    if (pending) return pending;

    const request = (async () => {
      const cartId = await getExistingCartId(userId);
      if (!cartId) return 0;

      const { data: items, error } = await supabase
        .from("cart_items")
        .select("quantity")
        .eq("cart_id", cartId);
      if (error) return 0;

      const count = (items ?? []).reduce((sum, item) => sum + normalizeQuantity(item?.quantity), 0);
      cartCountCache.set(cacheKey, { fetchedAt: Date.now(), count });
      return count;
    })().finally(() => {
      cartCountRequests.delete(cacheKey);
    });

    cartCountRequests.set(cacheKey, request);
    return request;
  } catch {
    return 0;
  }
};

/* Guarda el carrito local y notifica a la UI. */
const saveLocalCart = (items) => {
  window.localStorage.setItem(
    CART_KEY,
    JSON.stringify({
      updatedAt: Date.now(),
      items,
    }),
  );
  emitCartUpdate();
};

/* Obtiene el usuario actual si existe sesión. */
const getSessionUserId = async () => {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? "";
  } catch {
    return "";
  }
};

const getExistingCartId = async (userId) => {
  const cacheKey = getUserCacheKey(userId);
  if (!cacheKey) return "";

  const cached = cartIdCache.get(cacheKey);
  if (cached) return cached;

  const pending = cartIdRequests.get(cacheKey);
  if (pending) return pending;

  const request = supabase
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
    .then(({ data }) => {
      const cartId = String(data?.id ?? "").trim();
      if (cartId) cartIdCache.set(cacheKey, cartId);
      return cartId;
    })
    .catch(() => "")
    .finally(() => {
      cartIdRequests.delete(cacheKey);
    });

  cartIdRequests.set(cacheKey, request);
  return request;
};

/* Busca o crea el carrito persistente asociado al usuario. */
const getOrCreateCart = async (userId) => {
  const existingId = await getExistingCartId(userId);
  if (existingId) return existingId;

  const cacheKey = getUserCacheKey(userId);
  const pending = cartCreationRequests.get(cacheKey);
  if (pending) return pending;

  const request = supabase
    .from("carts")
    .insert({ user_id: userId })
    .select("id")
    .single()
    .then(({ data: created, error }) => {
      if (error || !created?.id) {
        if (error?.code === "23505") {
          return getExistingCartId(userId).then((cartId) => {
            if (!cartId) throw error;
            return cartId;
          });
        }
        throw error ?? new Error("No se pudo crear el carrito.");
      }
      cartIdCache.set(cacheKey, created.id);
      return created.id;
    })
    .finally(() => {
      cartCreationRequests.delete(cacheKey);
    });

  cartCreationRequests.set(cacheKey, request);
  return request;
};

const splitOwnProductsFromLocalItems = async (userId, localItems) => {
  const ids = localItems.map((item) => item.product_id).filter(Boolean);
  if (!userId || ids.length === 0) {
    return { allowedItems: localItems, removedCount: 0 };
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, user_id")
    .in("id", ids);

  const ownIds = new Set(
    (products ?? [])
      .filter((product) => String(product?.user_id ?? "").trim() === userId)
      .map((product) => String(product?.id ?? "").trim()),
  );

  if (ownIds.size === 0) {
    return { allowedItems: localItems, removedCount: 0 };
  }

  const allowedItems = localItems.filter((item) => !ownIds.has(item.product_id));
  const removedCount = localItems.length - allowedItems.length;
  return { allowedItems, removedCount };
};

/* Une items locales con el carrito en base de datos. */
const mergeLocalIntoDb = async (cartId, localItems) => {
  if (localItems.length === 0) return;
  const itemsByProductId = new Map(
    localItems.map((item) => [
      item.product_id,
      {
        cart_id: cartId,
        product_id: item.product_id,
        quantity: normalizeQuantity(item.quantity, item.product_snapshot?.stock ?? 100),
        price_snapshot: item.price_snapshot,
      },
    ]),
  );
  const { error } = await supabase
    .from("cart_items")
    .upsert([...itemsByProductId.values()], { onConflict: "cart_id,product_id" });

  if (error) throw error;
};

/* Sincroniza el carrito local al iniciar sesión. */
export const syncCartOnLogin = async (userId) => {
  if (!userId) return;
  const localItems = loadLocalCart();
  if (localItems.length === 0) return;
  try {
    const { allowedItems, removedCount } = await splitOwnProductsFromLocalItems(userId, localItems);
    const cartId = await getOrCreateCart(userId);
    await mergeLocalIntoDb(cartId, allowedItems);
    saveLocalCart([]);
    emitOwnCartItemsRemoved(removedCount);
  } catch {
    // Conserva el carrito local si falla la sincronización.
  }
};

const addProductToCart = async ({ product, productId, userId }) => {
  if (await isProductSold(productId)) return false;
  const priceSnapshot = normalizePrice(product?.price);
  const productSnapshot = normalizeProductSnapshot(product);

  /* Si no hay sesión, se guarda en localStorage. */
  if (!userId) {
    const items = loadLocalCart();
    const existing = items.find((item) => item.product_id === productId);
    if (existing) {
      existing.quantity = normalizeQuantity(existing.quantity, productSnapshot?.stock ?? 100);
      if (!existing.product_snapshot && productSnapshot) {
        existing.product_snapshot = productSnapshot;
      }
    } else {
      items.push({
        product_id: productId,
        quantity: 1,
        price_snapshot: priceSnapshot,
        product_snapshot: productSnapshot,
      });
    }
    saveLocalCart(items);
    return true;
  }

  /* Si hay sesión, se actualiza el carrito en base de datos. */
  const cartId = await getOrCreateCart(userId);
  const { error } = await supabase
    .from("cart_items")
    .upsert({
      cart_id: cartId,
      product_id: productId,
      quantity: 1,
      price_snapshot: priceSnapshot,
    }, { onConflict: "cart_id,product_id" });
  if (error) throw error;
  emitCartUpdate();
  return true;
};

/* Agrega un producto una sola vez, incluso ante eventos de UI simultáneos. */
export const addToCart = async (product) => {
  const productId = String(product?.id ?? "").trim();
  if (!productId) return false;

  const userId = await getSessionUserId();
  const requestKey = getCartAddRequestKey(userId, productId);
  const pending = cartAddRequests.get(requestKey);
  if (pending) return pending;

  const request = addProductToCart({ product, productId, userId })
    .finally(() => {
      cartAddRequests.delete(requestKey);
    });
  cartAddRequests.set(requestKey, request);
  return request;
};

export const updateQuantity = async (productId, quantity) => {
  const shouldRemove = Number(quantity ?? 0) <= 0;
  const userId = await getSessionUserId();

  /* Sin sesión: operar sobre localStorage. */
  if (!userId) {
    const items = loadLocalCart();
    const item = items.find((entry) => entry.product_id === productId);
    if (!item) return;
    if (shouldRemove) {
      saveLocalCart(items.filter((entry) => entry.product_id !== productId));
      return;
    }
    item.quantity = normalizeQuantity(quantity, item.product_snapshot?.stock ?? 100);
    saveLocalCart(items);
    return;
  }

  /* Con sesión: operar sobre la base de datos. */
  const cartId = await getOrCreateCart(userId);
  if (shouldRemove) {
    await supabase
      .from("cart_items")
      .delete()
      .eq("cart_id", cartId)
      .eq("product_id", productId);
    emitCartUpdate();
    return;
  }
  const { data: product } = await supabase.from("products").select("stock").eq("id", productId).maybeSingle();
  const safeQuantity = normalizeQuantity(quantity, product?.stock ?? 100);
  await supabase
    .from("cart_items")
    .update({ quantity: safeQuantity })
    .eq("cart_id", cartId)
    .eq("product_id", productId);
  emitCartUpdate();
};

/* API de conveniencia para eliminar un producto. */
export const removeFromCart = async (productId) => {
  await updateQuantity(productId, 0);
};

/* Trae info de productos para enriquecer items locales. */
const enrichWithProducts = async (items) => {
  const ids = items.map((item) => item.product_id).filter(Boolean);
  if (ids.length === 0) return items;
  const { data: products } = await supabase
    .from("products")
    .select(
      "id,title,image_url,currency,seller_name,contact,user_id,delivery_methods,stock,publication_type,publication_status,publication_expires_at",
    )
    .in("id", ids);
  const map = new Map((products ?? []).map((product) => [product.id, product]));
  return items.map((item) => {
    const product = map.get(item.product_id) ?? item.product_snapshot ?? null;
    return {
      ...item,
      quantity: normalizeQuantity(item.quantity, product?.stock ?? 100),
      product,
    };
  });
};

/* Devuelve el carrito normalizado según estado de sesión. */
export const getCart = async () => {
  const userId = await getSessionUserId();
  if (!userId) {
    const localItems = loadLocalCart();
    try {
      const enriched = await enrichWithProducts(localItems);
      const { availableItems, removedCount } = await splitSoldProductsFromItems(enriched);
      if (removedCount > 0) {
        saveLocalCart(availableItems);
      }
      return availableItems;
    } catch {
      const fallbackItems = localItems.map((item) => ({
        ...item,
        product: item.product_snapshot ?? null,
      }));
      const { availableItems, removedCount } = await splitSoldProductsFromItems(fallbackItems);
      if (removedCount > 0) {
        saveLocalCart(availableItems);
      }
      return availableItems;
    }
  }

  const cacheKey = getUserCacheKey(userId);
  const cached = cartDataCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CART_DATA_CACHE_TTL_MS) {
    return cached.items;
  }

  const pending = cartDataRequests.get(cacheKey);
  if (pending) return pending;

  const cartId = await getOrCreateCart(userId);
  const request = (async () => {
    const { data } = await supabase
      .from("cart_items")
      .select(
        "product_id, quantity, price_snapshot, products (id,title,image_url,currency,seller_name,contact,user_id,delivery_methods,stock,publication_type,publication_status,publication_expires_at)",
      )
      .eq("cart_id", cartId);
    const normalized = [...new Map(
      (data ?? [])
        .map((item) => ({
          product_id: String(item?.product_id ?? "").trim(),
          quantity: normalizeQuantity(item.quantity, item?.products?.stock ?? 100),
          price_snapshot: normalizePrice(item.price_snapshot),
          product: item.products ?? null,
        }))
        .filter((item) => item.product_id)
        .map((item) => [item.product_id, item]),
    ).values()];
    const { availableItems, removedCount } = await splitSoldProductsFromItems(normalized);
    if (removedCount > 0) {
      const soldIds = normalized
        .filter((item) => !availableItems.some((available) => available.product_id === item.product_id))
        .map((item) => item.product_id);
      await supabase
        .from("cart_items")
        .delete()
        .eq("cart_id", cartId)
        .in("product_id", soldIds);
      emitCartUpdate();
    }
    cartDataCache.set(cacheKey, { fetchedAt: Date.now(), items: availableItems });
    cartCountCache.set(cacheKey, { fetchedAt: Date.now(), count: availableItems.reduce((sum, item) => sum + item.quantity, 0) });
    return availableItems;
  })().finally(() => {
    cartDataRequests.delete(cacheKey);
  });

  cartDataRequests.set(cacheKey, request);
  return request;
};
