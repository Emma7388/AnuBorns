/* Dependencias: cliente Supabase para persistir carrito cuando hay sesión. */
import { supabase } from "./supabaseClient";

/* Clave localStorage para carrito anónimo. */
const CART_KEY = "ab_cart_v1";
const CART_LOCAL_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 días

/* Dispara un evento global para que la UI reaccione a cambios de carrito. */
const emitCartUpdate = () => {
  if (typeof window === "undefined") return;
  const event = new CustomEvent("ab-cart-updated");
  window.dispatchEvent(event);
  document.dispatchEvent(new CustomEvent("ab-cart-updated"));
};

const emitOwnCartItemsRemoved = (count) => {
  if (typeof window === "undefined" || !count) return;
  const detail = { count: Number(count) || 0 };
  window.dispatchEvent(new CustomEvent("ab-cart-own-items-removed", { detail }));
  document.dispatchEvent(new CustomEvent("ab-cart-own-items-removed", { detail }));
};

/* Normaliza cantidades a enteros válidos. */
const normalizeQuantity = (value) => {
  const qty = Number(value ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return Math.round(qty);
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

    return items
      .map((item) => ({
        product_id: String(item?.product_id ?? ""),
        quantity: normalizeQuantity(item?.quantity),
        price_snapshot: normalizePrice(item?.price_snapshot),
        product_snapshot: normalizeProductSnapshot(item?.product_snapshot),
      }))
      .filter((item) => item.product_id && item.quantity > 0);
  } catch {
    return [];
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

/* Busca o crea el carrito persistente asociado al usuario. */
const getOrCreateCart = async (userId) => {
  const { data: existing } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("carts")
    .insert({ user_id: userId })
    .select("id")
    .single();

  if (error || !created?.id) {
    throw error ?? new Error("No se pudo crear el carrito.");
  }
  return created.id;
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
  const { data: existingItems } = await supabase
    .from("cart_items")
    .select("id, product_id, quantity, price_snapshot")
    .eq("cart_id", cartId);

  const existingMap = new Map(
    (existingItems ?? []).map((item) => [item.product_id, item]),
  );

  const inserts = [];
  const updates = [];

  localItems.forEach((item) => {
    const existing = existingMap.get(item.product_id);
    if (!existing) {
      inserts.push({
        cart_id: cartId,
        product_id: item.product_id,
        quantity: item.quantity,
        price_snapshot: item.price_snapshot,
      });
      return;
    }
    updates.push({
      id: existing.id,
      quantity: (existing.quantity ?? 0) + item.quantity,
    });
  });

  if (inserts.length) {
    await supabase.from("cart_items").insert(inserts);
  }

  for (const update of updates) {
    await supabase
      .from("cart_items")
      .update({ quantity: update.quantity })
      .eq("id", update.id);
  }
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
    emitCartUpdate();
  } catch {
    // keep local cart if sync fails
  }
};

/* Agrega un producto al carrito (local o persistente). */
export const addToCart = async (product) => {
  const productId = String(product?.id ?? "");
  if (!productId) return;
  const priceSnapshot = normalizePrice(product?.price);
  const productSnapshot = normalizeProductSnapshot(product);

  /* Si no hay sesión, se guarda en localStorage. */
  const userId = await getSessionUserId();
  if (!userId) {
    const items = loadLocalCart();
    const existing = items.find((item) => item.product_id === productId);
    if (existing) {
      existing.quantity += 1;
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
    return;
  }

  /* Si hay sesión, se actualiza el carrito en base de datos. */
  const cartId = await getOrCreateCart(userId);
  const { data: existing } = await supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("cart_id", cartId)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("cart_items")
      .update({ quantity: (existing.quantity ?? 0) + 1 })
      .eq("id", existing.id);
  } else {
    await supabase.from("cart_items").insert({
      cart_id: cartId,
      product_id: productId,
      quantity: 1,
      price_snapshot: priceSnapshot,
    });
  }
  emitCartUpdate();
};

/* Actualiza la cantidad de un producto en el carrito. */
export const updateQuantity = async (productId, quantity) => {
  const normalized = normalizeQuantity(quantity);
  const userId = await getSessionUserId();

  /* Sin sesión: operar sobre localStorage. */
  if (!userId) {
    const items = loadLocalCart();
    const item = items.find((entry) => entry.product_id === productId);
    if (!item) return;
    if (normalized <= 0) {
      saveLocalCart(items.filter((entry) => entry.product_id !== productId));
      emitCartUpdate();
      return;
    }
    item.quantity = normalized;
    saveLocalCart(items);
    emitCartUpdate();
    return;
  }

  /* Con sesión: operar sobre la base de datos. */
  const cartId = await getOrCreateCart(userId);
  if (normalized <= 0) {
    await supabase
      .from("cart_items")
      .delete()
      .eq("cart_id", cartId)
      .eq("product_id", productId);
    emitCartUpdate();
    return;
  }
  await supabase
    .from("cart_items")
    .update({ quantity: normalized })
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
      "id,title,image_url,currency,seller_name,contact,user_id,delivery_methods",
    )
    .in("id", ids);
  const map = new Map((products ?? []).map((product) => [product.id, product]));
  return items.map((item) => ({
    ...item,
    product: map.get(item.product_id) ?? item.product_snapshot ?? null,
  }));
};

/* Devuelve el carrito normalizado según estado de sesión. */
export const getCart = async () => {
  const userId = await getSessionUserId();
  if (!userId) {
    const localItems = loadLocalCart();
    try {
      return await enrichWithProducts(localItems);
    } catch {
      return localItems.map((item) => ({
        ...item,
        product: item.product_snapshot ?? null,
      }));
    }
  }

  const cartId = await getOrCreateCart(userId);
  const { data } = await supabase
    .from("cart_items")
    .select(
      "product_id, quantity, price_snapshot, products (id,title,image_url,currency,seller_name,contact,user_id,delivery_methods)",
    )
    .eq("cart_id", cartId);
  const normalized = (data ?? []).map((item) => ({
    product_id: item.product_id,
    quantity: item.quantity,
    price_snapshot: normalizePrice(item.price_snapshot),
    product: item.products ?? null,
  }));
  return normalized;
};
