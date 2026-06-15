/* Historial de compras: local o remoto. */
import { supabase } from "../lib/supabaseClient";
import {
  getPurchaseStatusMessage,
  getPurchaseStatusToastStorageKey,
  shouldNotifyPurchaseStatus,
} from "../lib/purchaseStatusMessages";

/* Clave de órdenes locales offline. */
const ORDERS_KEY = "ab_orders_v1";

/* Referencias DOM. */
let list = document.getElementById("orders-list");
let emptyState = document.getElementById("orders-empty");
let status = document.getElementById("orders-status");
let currentUserId = "";
let syncInFlight = false;
let purchaseRealtimeChannel = null;
let purchaseRealtimeRefreshTimer = null;
let purchaseStatusToast = null;
let purchaseStatusToastMessage = null;
let purchaseStatusToastTimer = 0;

const PURCHASE_REALTIME_REFRESH_DEBOUNCE_MS = 900;

const isOrdersPageActive = () => window.location.pathname === "/mis-compras";

const refreshOrderNodes = () => {
  list = document.getElementById("orders-list");
  emptyState = document.getElementById("orders-empty");
  status = document.getElementById("orders-status");
};

const bindOrderEvents = () => {
  refreshOrderNodes();
  if (!list || list.dataset.fulfillmentBound === "1") return;
  list.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const pickupButton = target.closest("[data-confirm-pickup]");
    if (pickupButton instanceof HTMLButtonElement) {
      const orderId = String(pickupButton.dataset.confirmPickup ?? "").trim();
      const productIds = String(pickupButton.dataset.pickupProducts ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (!orderId || productIds.length === 0) return;

      pickupButton.disabled = true;
      const previousText = pickupButton.textContent;
      pickupButton.textContent = "Confirmando...";
      const result = await confirmPickupOnServer({ orderId, productIds });
      if (!result.ok) {
        pickupButton.disabled = false;
        pickupButton.textContent = previousText || "Ya retiré";
        if (status) status.textContent = result.error;
        return;
      }

      if (status) status.textContent = "Retiro confirmado. Avisamos al vendedor.";
      await loadOrders();
      return;
    }

    const deliveryButton = target.closest("[data-confirm-delivery]");
    if (!(deliveryButton instanceof HTMLButtonElement)) return;

    const orderId = String(deliveryButton.dataset.confirmDelivery ?? "").trim();
    const productIds = String(deliveryButton.dataset.deliveryProducts ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!orderId || productIds.length === 0) return;

    deliveryButton.disabled = true;
    const previousText = deliveryButton.textContent;
    deliveryButton.textContent = "Confirmando...";
    const result = await confirmDeliveryOnServer({ orderId, productIds });
    if (!result.ok) {
      deliveryButton.disabled = false;
      deliveryButton.textContent = previousText || "Ya recibí";
      if (status) status.textContent = result.error;
      return;
    }

    if (status) status.textContent = "Recepcion confirmada. Avisamos al vendedor.";
    await loadOrders();
  });
  list.dataset.fulfillmentBound = "1";
};

/* Formateo de precios ARS. */
const formatPrice = (value) => {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("es-AR");
};

/* Formateo de fecha legible. */
const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatShippingStatus = (value, requested) => {
  const statusValue = String(value ?? "").trim();
  if (!requested && (!statusValue || statusValue === "not_requested" || statusValue === "pickup_pending")) {
    return "Retiro pendiente";
  }
  const labels = {
    requested: "Envío solicitado",
    preparing: "Preparando envío",
    shipped: "Enviado",
    delivered: "Entregado",
    pickup_pending: "Retiro pendiente",
    ready_for_pickup: "Listo para retirar",
    picked_up: "Retirado",
    completed: "Completado",
    not_requested: "Sin envío",
  };
  return labels[statusValue] ?? labels.requested;
};

const formatOrderPaymentStatus = (value) => {
  const labels = {
    approved: "Pago aprobado",
    pending: "Pago pendiente",
    rejected: "Pago rechazado",
    cancelled: "Pago cancelado",
    refunded: "Pago reembolsado",
  };
  const statusValue = String(value ?? "").trim().toLowerCase();
  return labels[statusValue] ?? "Compra registrada";
};

const isOrderPaymentApproved = (order) => {
  const statusValue = String(order?.status ?? "").trim().toLowerCase();
  return !statusValue || statusValue === "approved";
};

const SHIPPING_FULFILLMENT_STATUSES = new Set(["requested", "preparing", "shipped", "delivered"]);
const PICKUP_FULFILLMENT_STATUSES = new Set(["pickup_pending", "ready_for_pickup", "picked_up"]);
const FULFILLMENT_STATUS_PRIORITY = {
  pending: 0,
  requested: 0,
  pickup_pending: 0,
  preparing: 1,
  shipped: 2,
  ready_for_pickup: 2,
  delivered: 3,
  picked_up: 3,
  completed: 4,
};

const isShippingFulfillmentStatus = (status) =>
  SHIPPING_FULFILLMENT_STATUSES.has(String(status ?? "").trim());

const isPickupFulfillmentStatus = (status) =>
  PICKUP_FULFILLMENT_STATUSES.has(String(status ?? "").trim());

const getProviderShippingRequested = (statuses = [], orderShippingRequested = false) => {
  const safeStatuses = (Array.isArray(statuses) ? statuses : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  if (safeStatuses.some(isShippingFulfillmentStatus)) return true;
  if (safeStatuses.some(isPickupFulfillmentStatus)) return false;
  return Boolean(orderShippingRequested);
};

const getAggregateFulfillmentStatus = (statuses = [], fallbackStatus = "", shippingRequested = false) => {
  const safeStatuses = (Array.isArray(statuses) ? statuses : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  if (safeStatuses.length === 0) {
    return String(fallbackStatus ?? "").trim() || (shippingRequested ? "requested" : "pickup_pending");
  }
  if (safeStatuses.every((item) => item === "completed")) return "completed";

  const activeStatuses = safeStatuses.filter((item) => item !== "completed");
  const candidates = activeStatuses.length > 0 ? activeStatuses : safeStatuses;
  return candidates.reduce((best, item) => {
    const bestPriority = FULFILLMENT_STATUS_PRIORITY[best] ?? 0;
    const itemPriority = FULFILLMENT_STATUS_PRIORITY[item] ?? 0;
    return itemPriority > bestPriority ? item : best;
  }, candidates[0]);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const toWhatsappDigits = (value) => String(value ?? "").replace(/\D+/g, "");
const normalizeProviderKey = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const getFulfillmentMapKey = (orderId, productId) => `${String(orderId ?? "").trim()}::${String(productId ?? "").trim()}`;

const getItemFulfillmentStatus = (fulfillmentMap, orderId, productId, fallbackStatus) =>
  String(fulfillmentMap?.[getFulfillmentMapKey(orderId, productId)]?.fulfillmentStatus ?? fallbackStatus ?? "").trim();

const ensurePurchaseStatusToast = () => {
  if (purchaseStatusToast) return;
  purchaseStatusToast = document.createElement("div");
  purchaseStatusToast.className = "ab-cart-toast ab-purchase-status-toast";
  purchaseStatusToast.setAttribute("role", "status");
  purchaseStatusToast.setAttribute("aria-live", "polite");
  purchaseStatusToast.setAttribute("aria-atomic", "true");
  purchaseStatusToast.innerHTML = `
    <span class="ab-cart-toast__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
    <span class="ab-cart-toast__message">Estado actualizado</span>
  `;
  document.body.appendChild(purchaseStatusToast);
  purchaseStatusToastMessage = purchaseStatusToast.querySelector(".ab-cart-toast__message");
};

const showRenderedPurchaseStatusToast = (items = []) => {
  const notifiableItems = (Array.isArray(items) ? items : []).filter(shouldNotifyPurchaseStatus);
  const unannouncedItems = notifiableItems.filter((item) => !window.sessionStorage.getItem(getPurchaseStatusToastStorageKey(item)));
  if (unannouncedItems.length === 0) return;

  unannouncedItems.forEach((item) => {
    window.sessionStorage.setItem(getPurchaseStatusToastStorageKey(item), "1");
  });
  ensurePurchaseStatusToast();
  if (!purchaseStatusToast) return;
  const latest = unannouncedItems[unannouncedItems.length - 1];
  if (purchaseStatusToastMessage) {
    purchaseStatusToastMessage.textContent = getPurchaseStatusMessage(latest, unannouncedItems.length);
  }
  if (purchaseStatusToastTimer) window.clearTimeout(purchaseStatusToastTimer);
  purchaseStatusToast.classList.remove("is-visible");
  window.requestAnimationFrame(() => {
    purchaseStatusToast?.classList.add("is-visible");
  });
  purchaseStatusToastTimer = window.setTimeout(() => {
    purchaseStatusToast?.classList.remove("is-visible");
    purchaseStatusToastTimer = 0;
  }, 5000);
};

const fetchPurchaseFulfillmentMap = async (orders = []) => {
  const orderIds = [...new Set(
    (Array.isArray(orders) ? orders : [])
      .map((order) => String(order?.id ?? "").trim())
      .filter(Boolean),
  )];
  if (orderIds.length === 0) return {};

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? "";
  if (!token) return {};

  const response = await fetch(`/api/purchase-fulfillment?orderIds=${encodeURIComponent(orderIds.join(","))}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload?.items)) return {};

  const unreadItems = [];
  const map = payload.items.reduce((nextMap, item) => {
    const orderId = String(item?.orderId ?? "").trim();
    const productId = String(item?.productId ?? "").trim();
    const fulfillmentStatus = String(item?.fulfillmentStatus ?? "").trim();
    if (!orderId || !productId) return nextMap;
    nextMap[getFulfillmentMapKey(orderId, productId)] = {
      fulfillmentStatus,
      statusUpdatedAt: String(item?.statusUpdatedAt ?? "").trim(),
      statusRead: Boolean(item?.statusRead),
    };
    const nextItem = {
      orderId,
      productId,
      fulfillmentStatus,
      statusUpdatedAt: String(item?.statusUpdatedAt ?? "").trim(),
      statusRead: Boolean(item?.statusRead),
    };
    if (
      fulfillmentStatus &&
      !item?.statusRead &&
      (payload?.hasAnyRead || shouldNotifyPurchaseStatus(nextItem))
    ) {
      unreadItems.push(nextItem);
    }
    return nextMap;
  }, {});
  Object.defineProperty(map, "__unreadItems", {
    value: unreadItems,
    enumerable: false,
  });
  return map;
};

const markPurchaseStatusesReadOnServer = async (items = []) => {
  const reads = (Array.isArray(items) ? items : [])
    .map((item) => ({
      orderId: String(item?.orderId ?? "").trim(),
      productId: String(item?.productId ?? "").trim(),
      fulfillmentStatus: String(item?.fulfillmentStatus ?? "").trim(),
      statusUpdatedAt: String(item?.statusUpdatedAt ?? "").trim(),
    }))
    .filter((item) => item.orderId && item.productId && item.fulfillmentStatus);
  if (reads.length === 0) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? "";
  if (!token) return;

  await fetch("/api/purchase-fulfillment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items: reads }),
  }).catch(() => {});
};

const markRenderedPurchaseStatusesRead = (fulfillmentMap = {}) => {
  const unreadItems = Array.isArray(fulfillmentMap.__unreadItems) ? fulfillmentMap.__unreadItems : [];
  if (unreadItems.length === 0) return;
  showRenderedPurchaseStatusToast(unreadItems);
  void markPurchaseStatusesReadOnServer(unreadItems);
};

const confirmPickupOnServer = async ({ orderId, productIds }) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? "";
  if (!token) return { ok: false, error: "Tenés que iniciar sesión." };

  const response = await fetch("/api/purchase-pickup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId, productIds }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: String(payload?.error ?? "No se pudo confirmar el retiro.") };
  }
  return { ok: true };
};

const confirmDeliveryOnServer = async ({ orderId, productIds }) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? "";
  if (!token) return { ok: false, error: "Tenés que iniciar sesión." };

  const response = await fetch("/api/purchase-delivery", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId, productIds }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: String(payload?.error ?? "No se pudo confirmar la recepcion.") };
  }
  return { ok: true };
};

const schedulePurchaseRealtimeRefresh = () => {
  window.clearTimeout(purchaseRealtimeRefreshTimer);
  purchaseRealtimeRefreshTimer = window.setTimeout(() => {
    void loadOrders();
  }, PURCHASE_REALTIME_REFRESH_DEBOUNCE_MS);
};

const setupPurchaseRealtime = async () => {
  if (!currentUserId || purchaseRealtimeChannel) return;
  purchaseRealtimeChannel = supabase
    .channel(`purchase-status-${currentUserId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${currentUserId}` },
      schedulePurchaseRealtimeRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sale_dispatches" },
      schedulePurchaseRealtimeRefresh,
    )
    .subscribe();
};

const teardownPurchaseRealtime = async () => {
  window.clearTimeout(purchaseRealtimeRefreshTimer);
  purchaseRealtimeRefreshTimer = null;
  if (!purchaseRealtimeChannel) return;
  const channel = purchaseRealtimeChannel;
  purchaseRealtimeChannel = null;
  await supabase.removeChannel(channel);
};

const buildWhatsappUrl = (provider, phone) => {
  const digits = toWhatsappDigits(phone);
  if (!digits) return "";
  const message = encodeURIComponent(`Hola ${provider}, te contacto por una compra en AnuBorns.`);
  return `https://wa.me/${digits}?text=${message}`;
};

const extractBuyerNote = (order) => {
  const localNote = String(order?.buyer_note ?? "").trim();
  if (localNote) return localNote;
  const detail = String(order?.payment_detail ?? "").trim();
  const marker = "note:";
  const index = detail.indexOf(marker);
  if (index < 0) return "";
  return detail.slice(index + marker.length).trim();
};

const normalizeOrderItemsForManualCheckout = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      product_id: String(item?.product_id ?? "").trim() || null,
      qty: 1,
    }))
    .filter((item) => item.product_id);

const normalizeLocalShippingGroups = (localOrder) =>
  (Array.isArray(localOrder?.shipping_groups) ? localOrder.shipping_groups : [])
    .map((group) => ({
      provider_key: String(group?.provider_key ?? "").trim(),
      provider: String(group?.provider ?? "").trim(),
      address: String(group?.address ?? "").trim(),
      city: String(group?.city ?? "").trim(),
    }))
    .filter((group) => group.provider_key);

const getLocalSyncStatusMessage = ({ syncedCount = 0, remainingCount = 0, conflictCount = 0 } = {}) => {
  if (syncedCount === 0 && remainingCount === 0 && conflictCount === 0) return "";
  const messages = [];
  if (syncedCount > 0) messages.push(`Sincronizamos ${syncedCount} compra(s) locales al servidor.`);
  if (conflictCount > 0) {
    messages.push(`${conflictCount} compra(s) locales no se sincronizaron porque el producto ya fue vendido.`);
  }
  if (remainingCount > 0) messages.push(`Quedan ${remainingCount} compra(s) pendientes por reintentar.`);
  return messages.join(" ");
};

const syncLocalOrdersToServer = async (userId) => {
  if (!userId || syncInFlight) return { syncedCount: 0, remainingCount: 0, conflictCount: 0 };
  syncInFlight = true;
  try {
    const raw = window.localStorage.getItem(ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const localOrders = Array.isArray(parsed[userId]) ? parsed[userId] : [];
    if (localOrders.length === 0) {
      return { syncedCount: 0, remainingCount: 0, conflictCount: 0 };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    if (!token) {
      return { syncedCount: 0, remainingCount: localOrders.length, conflictCount: 0 };
    }

    let syncedCount = 0;
    let conflictCount = 0;
    const remaining = [];

    for (const localOrder of localOrders) {
      const safeItems = normalizeOrderItemsForManualCheckout(localOrder?.order_items);
      if (safeItems.length === 0) continue;

      const response = await fetch("/api/checkout-manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: safeItems,
          shipping: {
            requested: Boolean(localOrder?.shipping_requested),
            fullName: String(localOrder?.shipping_full_name ?? "").trim(),
            address: String(localOrder?.shipping_address ?? "").trim(),
            city: String(localOrder?.shipping_city ?? "").trim(),
            phone: String(localOrder?.shipping_phone ?? "").trim(),
            groups: normalizeLocalShippingGroups(localOrder),
          },
          buyer_note: extractBuyerNote(localOrder),
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          conflictCount += 1;
          continue;
        }
        remaining.push(localOrder);
        continue;
      }

      syncedCount += 1;
    }

    parsed[userId] = remaining;
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(parsed));
    return { syncedCount, remainingCount: remaining.length, conflictCount };
  } catch {
    return { syncedCount: 0, remainingCount: 0, conflictCount: 0 };
  } finally {
    syncInFlight = false;
  }
};

const buildProviderMetaMap = async (history = []) => {
  const productIds = [
    ...new Set(
      history
        .flatMap((order) => (Array.isArray(order?.order_items) ? order.order_items : []))
        .map((item) => String(item?.product_id ?? "").trim())
        .filter(Boolean)
    ),
  ];

  const providerNames = [
    ...new Set(
      history
        .flatMap((order) => (Array.isArray(order?.order_items) ? order.order_items : []))
        .map((item) => String(item?.provider ?? "").trim())
        .filter(Boolean)
    ),
  ];

  if (providerNames.length === 0 && productIds.length === 0) return {};

  const map = {};

  if (productIds.length > 0) {
    const { data: byProducts, error: byProductsError } = await supabase
      .from("products")
      .select("id, seller_name, contact, user_id")
      .in("id", productIds);

    if (!byProductsError && Array.isArray(byProducts)) {
      byProducts.forEach((row) => {
        const provider = String(row?.seller_name ?? "").trim();
        const phone = toWhatsappDigits(row?.contact);
        const userId = String(row?.user_id ?? "").trim();
        const key = normalizeProviderKey(provider);
        if (!key) return;
        if (!map[key]) map[key] = { phone: "", userId: "" };
        if (phone && !map[key].phone) map[key].phone = phone;
        if (userId && !map[key].userId) map[key].userId = userId;
      });
    }
  }

  if (providerNames.length > 0) {
    const { data, error } = await supabase
      .from("products")
      .select("seller_name, contact, user_id")
      .in("seller_name", providerNames);

    if (error || !Array.isArray(data)) return map;

    data.forEach((row) => {
      const provider = String(row?.seller_name ?? "").trim();
      const phone = toWhatsappDigits(row?.contact);
      const userId = String(row?.user_id ?? "").trim();
      const key = normalizeProviderKey(provider);
      if (!key) return;
      if (!map[key]) map[key] = { phone: "", userId: "" };
      if (phone && !map[key].phone) map[key].phone = phone;
      if (userId && !map[key].userId) map[key].userId = userId;
    });
  }

  /* Respaldo amplio para matchear nombres con pequeñas diferencias. */
  if (Object.keys(map).length === 0 && providerNames.length > 0) {
    const { data: allProducts, error: allProductsError } = await supabase
      .from("products")
      .select("seller_name, contact, user_id")
      .not("contact", "is", null);

    if (!allProductsError && Array.isArray(allProducts)) {
      allProducts.forEach((row) => {
        const provider = String(row?.seller_name ?? "").trim();
        const phone = toWhatsappDigits(row?.contact);
        const userId = String(row?.user_id ?? "").trim();
        const key = normalizeProviderKey(provider);
        if (!key) return;
        if (!map[key]) map[key] = { phone: "", userId: "" };
        if (phone && !map[key].phone) map[key].phone = phone;
        if (userId && !map[key].userId) map[key].userId = userId;
      });
    }
  }

  return map;
};

const hydrateOrderItemImages = async (history = []) => {
  if (!Array.isArray(history) || history.length === 0) return history;
  const productIds = [
    ...new Set(
      history
        .flatMap((order) => (Array.isArray(order?.order_items) ? order.order_items : []))
        .map((item) => String(item?.product_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  if (productIds.length === 0) return history;

  const { data: products, error } = await supabase
    .from("products")
    .select("id, image_url")
    .in("id", productIds);

  if (error || !Array.isArray(products)) return history;
  const imageMap = new Map(products.map((product) => [String(product.id), String(product.image_url ?? "").trim()]));

  return history.map((order) => ({
    ...order,
    order_items: (Array.isArray(order?.order_items) ? order.order_items : []).map((item) => {
      const currentImage = String(item?.image ?? "").trim();
      if (currentImage) return item;
      const imageFromProduct = imageMap.get(String(item?.product_id ?? "").trim()) ?? "";
      return {
        ...item,
        image: imageFromProduct || "/logo2.svg",
      };
    }),
  }));
};

/* Renderiza lista de órdenes en el DOM. */
const renderHistory = (history = [], providerMetaMap = {}, fulfillmentMap = {}) => {
  if (!list) return;
  list.innerHTML = "";
  list.classList.add("ab-provider-products-grid");

  if (!Array.isArray(history) || history.length === 0) {
    return;
  }

  history.forEach((order) => {
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    const buyerNote = extractBuyerNote(order);
    const orderId = String(order.id ?? "").trim();
    const orderPaymentApproved = isOrderPaymentApproved(order);
    const orderPaymentStatus = formatOrderPaymentStatus(order.status);
    const orderDate = formatDate(order.created_at);
    const currency = String(order.currency ?? "ARS").trim() || "ARS";
    const shippingRequested = Boolean(order.shipping_requested);
    const shippingCost = Number(order.shipping_cost ?? 0);
    const orderShippingStatus = String(order.shipping_status ?? "").trim();
    const shippingAddress = String(order.shipping_address ?? "").trim();
    const shippingCity = String(order.shipping_city ?? "").trim();
    const shippingPhone = String(order.shipping_phone ?? "").trim();

    const itemsByProvider = new Map();
    items.forEach((item) => {
      const provider = String(item?.provider ?? "Proveedor").trim() || "Proveedor";
      const bucket = itemsByProvider.get(provider) ?? [];
      bucket.push(item);
      itemsByProvider.set(provider, bucket);
    });

    Array.from(itemsByProvider.entries()).forEach(([provider, providerItems]) => {
      const firstWithUser = providerItems.find((item) => String(item?.provider_user_id ?? "").trim());
      const firstWithPhone = providerItems.find((item) => toWhatsappDigits(item?.provider_whatsapp));
      const providerKey = normalizeProviderKey(provider);
      const providerMeta = providerMetaMap[providerKey] ?? { phone: "", userId: "" };
      const providerPhone = toWhatsappDigits(firstWithPhone?.provider_whatsapp) || providerMeta.phone || "";
      const providerUserId = String(firstWithUser?.provider_user_id ?? "").trim() || providerMeta.userId || "";
      const providerProfileHref = providerUserId ? `/proveedor-publico/${encodeURIComponent(providerUserId)}` : "";
      const waLink = buildWhatsappUrl(provider, providerPhone);
      const card = document.createElement("article");
      card.className = "ab-provider-product-card ab-order-product-card";
      const coverImage = escapeHtml(String(providerItems[0]?.image ?? "").trim() || "/logo2.svg");
      const pickupProductIds = providerItems
        .filter((item) =>
          getItemFulfillmentStatus(fulfillmentMap, orderId, item?.product_id, orderShippingStatus) === "ready_for_pickup"
        )
        .map((item) => String(item?.product_id ?? "").trim())
        .filter(Boolean);
      const providerStatuses = providerItems
        .map((item) => getItemFulfillmentStatus(fulfillmentMap, orderId, item?.product_id, orderShippingStatus))
        .filter(Boolean);
      const providerShippingRequested = getProviderShippingRequested(providerStatuses, shippingRequested);
      const deliveryProductIds = providerItems
        .filter((item) =>
          getItemFulfillmentStatus(fulfillmentMap, orderId, item?.product_id, orderShippingStatus) === "shipped"
        )
        .map((item) => String(item?.product_id ?? "").trim())
        .filter(Boolean);
      const providerStatus = providerStatuses.length > 0 && providerStatuses.every((item) => item === providerStatuses[0])
        ? formatShippingStatus(providerStatuses[0], providerShippingRequested)
        : formatShippingStatus(
            getAggregateFulfillmentStatus(providerStatuses, orderShippingStatus, providerShippingRequested),
            providerShippingRequested,
          );
      const confirmPickupButton = orderPaymentApproved && !providerShippingRequested && pickupProductIds.length > 0
        ? `<button
            type="button"
            class="ab-provider-product-card__button ab-provider-product-card__button--buy"
            data-confirm-pickup="${escapeHtml(orderId)}"
            data-pickup-products="${escapeHtml(pickupProductIds.join(","))}"
          >
            Ya retiré
          </button>`
        : "";
      const confirmDeliveryButton = orderPaymentApproved && providerShippingRequested && deliveryProductIds.length > 0
        ? `<button
            type="button"
            class="ab-provider-product-card__button ab-provider-product-card__button--buy"
            data-confirm-delivery="${escapeHtml(orderId)}"
            data-delivery-products="${escapeHtml(deliveryProductIds.join(","))}"
          >
            Ya recibí
          </button>`
        : "";
      const providerNameMarkup = providerProfileHref
        ? `<a class="ab-order-card__provider-link" href="${providerProfileHref}">${escapeHtml(provider)}</a>`
        : `<span class="ab-order-card__provider-link ab-order-card__provider-link--disabled">${escapeHtml(provider)}</span>`;

      card.innerHTML = `
        <img class="ab-provider-product-card__image" src="${coverImage}" alt="${escapeHtml(provider)}" loading="lazy" />
        <div class="ab-provider-product-card__meta">
          <div>
            <p class="ab-provider-product-card__label">Compra ${escapeHtml(orderId.slice(0, 8) || "N/A")}</p>
            <p class="ab-provider-product-card__code">${orderDate || "Sin fecha"}</p>
          </div>
        </div>
        <h2>${providerNameMarkup}</h2>
        <ul class="ab-provider-product-card__details">
          <li>Pago: <strong>${escapeHtml(orderPaymentStatus)}</strong></li>
          ${providerItems
            .map((item) => {
              const price = Number(item?.unit_price ?? 0);
              const itemStatus = getItemFulfillmentStatus(fulfillmentMap, orderId, item?.product_id, orderShippingStatus);
              const itemShippingRequested =
                isShippingFulfillmentStatus(itemStatus) ||
                (shippingRequested && !isPickupFulfillmentStatus(itemStatus));
              const itemStatusLabel = itemStatus
                ? ` · ${formatShippingStatus(itemStatus, itemShippingRequested)}`
                : "";
              return `<li>Producto: <strong>${escapeHtml(item?.name ?? "Producto")} · $${formatPrice(price)}${escapeHtml(itemStatusLabel)}</strong></li>`;
            })
            .join("")}
          ${
            providerShippingRequested
              ? `<li>Entrega: <strong>${escapeHtml(providerStatus)}</strong></li>
                 <li>Costo envío: <strong>$${formatPrice(shippingCost)}</strong></li>
                 <li>Dirección: <strong>${escapeHtml([shippingAddress, shippingCity].filter(Boolean).join(", ") || "Sin dirección")}</strong></li>
                 ${shippingPhone ? `<li>Teléfono: <strong>${escapeHtml(shippingPhone)}</strong></li>` : ""}`
              : `<li>Entrega: <strong>${escapeHtml(providerStatus)}</strong></li>`
          }
          <li class="ab-order-card__highlight">TOTAL: <strong>$${formatPrice(order.total_amount ?? 0)} ${escapeHtml(currency)}</strong></li>
          ${buyerNote ? `<li class="ab-order-card__highlight ab-order-card__highlight--note">Nota: <strong>${escapeHtml(buyerNote)}</strong></li>` : ""}
        </ul>
        <div class="ab-provider-product-card__actions">
          ${
            waLink
              ? `<a class="ab-provider-product-card__button ab-order-card__provider-phone-link" href="${waLink}" target="_blank" rel="noreferrer noopener">
                  <img src="/icons/social.svg" alt="" aria-hidden="true" />
                  <span>Contactá</span>
                </a>`
              : `<button type="button" class="ab-provider-product-card__button" disabled>
                  <img src="/icons/social.svg" alt="" aria-hidden="true" />
                  <span>Sin WhatsApp</span>
                </button>`
          }
          <button type="button" class="ab-provider-product-card__button ab-provider-product-card__button--ghost">
            Ver factura
          </button>
          ${confirmPickupButton}
          ${confirmDeliveryButton}
        </div>
      `;

      list.appendChild(card);
    });
  });
};

/* Muestra u oculta estado vacío. */
const renderOrders = () => {
  if (!list || !emptyState) return;
  const hasHistory = list.children.length > 0;
  if (hasHistory) {
    emptyState.classList.add("ab-is-hidden");
    emptyState.style.display = "none";
    return;
  }
  emptyState.classList.remove("ab-is-hidden");
  emptyState.style.display = "grid";
};

/* Carga órdenes locales o desde Supabase. */
const loadOrders = async () => {
  refreshOrderNodes();
  if (!isOrdersPageActive()) {
    await teardownPurchaseRealtime();
    return;
  }
  if (!list || !emptyState) return;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) {
    await teardownPurchaseRealtime();
    currentUserId = "";
    if (status) status.textContent = "Tenés que iniciar sesión para ver tus compras.";
    window.location.href = "/login?returnTo=/mis-compras";
    return;
  }

  /* Primero intenta usar órdenes locales guardadas. */
  const userId = sessionData.session.user.id;
  if (currentUserId && currentUserId !== userId) {
    await teardownPurchaseRealtime();
  }
  currentUserId = userId;
  const syncResult = await syncLocalOrdersToServer(userId);
  const syncMessage = getLocalSyncStatusMessage(syncResult);

  try {
    const raw = window.localStorage.getItem(ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const localOrders = Array.isArray(parsed[userId]) ? parsed[userId] : [];
    if (localOrders.length > 0) {
      const currentOrders = await hydrateOrderItemImages(localOrders);
      const providerMetaMap = await buildProviderMetaMap(currentOrders);
      const fulfillmentMap = await fetchPurchaseFulfillmentMap(currentOrders);
      if (status) status.textContent = syncMessage;
      renderHistory(currentOrders, providerMetaMap, fulfillmentMap);
      markRenderedPurchaseStatusesRead(fulfillmentMap);
      renderOrders();
      await setupPurchaseRealtime();
      return;
    }
  } catch {
    // Continúa con la carga remota.
  }

  /* Si no hay locales, trae órdenes remotas. */
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, created_at, total_amount, currency, status, payment_detail, shipping_requested, shipping_cost, shipping_status, shipping_full_name, shipping_address, shipping_city, shipping_phone, order_items (product_id, name, qty, unit_price, provider, image)",
    )
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false });

  if (error) {
    const rawMessage = String(error.message ?? "");
    const missingOrdersTable =
      rawMessage.includes("public.orders") ||
      rawMessage.includes("relation \"orders\" does not exist") ||
      rawMessage.includes("schema cache");

    if (missingOrdersTable) {
      renderHistory([], {}, {});
      renderOrders();
      if (status) {
        status.textContent =
          "No encontramos la tabla de compras en Supabase (orders). Ejecutá el schema SQL para habilitar compras remotas.";
      }
      return;
    }

    if (status) status.textContent = `Error cargando órdenes: ${rawMessage}`;
    return;
  }

  if (status) status.textContent = syncMessage;
  const safeData = await hydrateOrderItemImages(data ?? []);
  const providerMetaMap = await buildProviderMetaMap(safeData);
  const fulfillmentMap = await fetchPurchaseFulfillmentMap(safeData);
  renderHistory(safeData, providerMetaMap, fulfillmentMap);
  markRenderedPurchaseStatusesRead(fulfillmentMap);
  renderOrders();
  await setupPurchaseRealtime();
};

const initOrdersPage = () => {
  refreshOrderNodes();
  if (!isOrdersPageActive()) {
    void teardownPurchaseRealtime();
    return;
  }
  bindOrderEvents();
  void loadOrders();
};

initOrdersPage();
document.addEventListener("astro:page-load", initOrdersPage);
document.addEventListener("astro:after-swap", initOrdersPage);
window.addEventListener("pageshow", initOrdersPage);
window.addEventListener("pagehide", teardownPurchaseRealtime);
