import { supabase } from "./supabaseClient";

const CART_KEY = "ab_cart_v1";

const emitCartUpdate = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ab-cart-updated"));
};

const normalizeQuantity = (value) => {
  const qty = Number(value ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return Math.round(qty);
};

const normalizePrice = (value) => {
  const price = Number(value ?? 0);
  if (!Number.isFinite(price) || price < 0) return 0;
  return price;
};

const loadLocalCart = () => {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        product_id: String(item?.product_id ?? ""),
        quantity: normalizeQuantity(item?.quantity),
        price_snapshot: normalizePrice(item?.price_snapshot),
      }))
      .filter((item) => item.product_id && item.quantity > 0);
  } catch {
    return [];
  }
};

const saveLocalCart = (items) => {
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  emitCartUpdate();
};

const getSessionUserId = async () => {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? "";
  } catch {
    return "";
  }
};

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

const mergeLocalIntoDb = async (cartId, localItems) => {
  if (localItems.length === 0) return;
  const { data: existingItems } = await supabase
    .from("cart_items")
    .select("id, product_id, quantity, price_snapshot")
    .eq("cart_id", cartId);

  const existingMap = new Map(
    (existingItems ?? []).map((item) => [item.product_id, item])
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
    await supabase.from("cart_items").update({ quantity: update.quantity }).eq("id", update.id);
  }
};

export const syncCartOnLogin = async (userId) => {
  if (!userId) return;
  const localItems = loadLocalCart();
  if (localItems.length === 0) return;
  try {
    const cartId = await getOrCreateCart(userId);
    await mergeLocalIntoDb(cartId, localItems);
    saveLocalCart([]);
    emitCartUpdate();
  } catch {
    // keep local cart if sync fails
  }
};

export const addToCart = async (product) => {
  const productId = String(product?.id ?? "");
  if (!productId) return;
  const priceSnapshot = normalizePrice(product?.price);

  const userId = await getSessionUserId();
  if (!userId) {
    const items = loadLocalCart();
    const existing = items.find((item) => item.product_id === productId);
    if (existing) {
      existing.quantity += 1;
    } else {
      items.push({ product_id: productId, quantity: 1, price_snapshot: priceSnapshot });
    }
    saveLocalCart(items);
    return;
  }

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

export const updateQuantity = async (productId, quantity) => {
  const normalized = normalizeQuantity(quantity);
  const userId = await getSessionUserId();

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

export const removeFromCart = async (productId) => {
  await updateQuantity(productId, 0);
};

const enrichWithProducts = async (items) => {
  const ids = items.map((item) => item.product_id).filter(Boolean);
  if (ids.length === 0) return items;
  const { data: products } = await supabase
    .from("products")
    .select("id,title,image_url,currency,seller_name")
    .in("id", ids);
  const map = new Map((products ?? []).map((product) => [product.id, product]));
  return items.map((item) => ({
    ...item,
    product: map.get(item.product_id) ?? null,
  }));
};

export const getCart = async () => {
  const userId = await getSessionUserId();
  if (!userId) {
    const localItems = loadLocalCart();
    try {
      return await enrichWithProducts(localItems);
    } catch {
      return localItems.map((item) => ({ ...item, product: null }));
    }
  }

  const cartId = await getOrCreateCart(userId);
  const { data } = await supabase
    .from("cart_items")
    .select("product_id, quantity, price_snapshot, products (id,title,image_url,currency,seller_name)")
    .eq("cart_id", cartId);
  const normalized = (data ?? []).map((item) => ({
    product_id: item.product_id,
    quantity: item.quantity,
    price_snapshot: normalizePrice(item.price_snapshot),
    product: item.products ?? null,
  }));
  return normalized;
};
