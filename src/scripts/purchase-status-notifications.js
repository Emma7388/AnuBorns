/* Notificaciones globales para cambios de estado en compras del usuario. */
import { supabase } from "../lib/supabaseClient";
import {
  getPurchaseStatusMessage,
  getPurchaseStatusReadKey,
  getPurchaseStatusToastStorageKey,
  shouldNotifyPurchaseStatus,
} from "../lib/purchaseStatusMessages";

let purchaseStatusToast = null;
let purchaseStatusToastMessage = null;
let purchaseStatusToastTimer = 0;
let purchaseRealtimeChannel = null;
let purchaseRealtimeRefreshTimer = 0;
let purchaseRealtimeUserId = "";
let lastPurchaseStatusRefreshAt = 0;
let lastPurchaseStatusRefreshUserId = "";
const announcedPurchaseStatusKeys = new Set();

const PURCHASE_REALTIME_REFRESH_DEBOUNCE_MS = 900;
const PURCHASE_STATUS_MIN_REFRESH_MS = 2500;

/* En Mis compras la página ya muestra los cambios; no hace falta toast global. */
const isPurchasesPageActive = () => window.location.pathname === "/mis-compras";

/* Clave por orden-producto para cruzar datos de orders y sale_dispatches. */
const getFulfillmentMapKey = (orderId, productId) =>
  `${String(orderId ?? "").trim()}::${String(productId ?? "").trim()}`;

/* Marca estados como leídos sin bloquear la navegación. */
const markPurchaseStatusesReadOnServer = async (token, items = []) => {
  const reads = (Array.isArray(items) ? items : [])
    .map((item) => ({
      orderId: String(item?.orderId ?? "").trim(),
      productId: String(item?.productId ?? "").trim(),
      fulfillmentStatus: String(item?.fulfillmentStatus ?? item?.status ?? "").trim(),
      statusUpdatedAt: String(item?.statusUpdatedAt ?? "").trim(),
    }))
    .filter((item) => item.orderId && item.productId && item.fulfillmentStatus);
  if (!token || reads.length === 0) return;

  await fetch("/api/purchase-fulfillment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items: reads }),
  }).catch(() => {});
};

/* Crea el toast una sola vez y lo reutiliza. */
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
    <a class="ab-cart-toast__link" href="/mis-compras">Ver</a>
  `;
  document.body.appendChild(purchaseStatusToast);
  purchaseStatusToastMessage = purchaseStatusToast.querySelector(".ab-cart-toast__message");
};

/* Muestra una notificación breve con enlace a Mis compras. */
const showPurchaseStatusToast = ({ changedCount, latestItem }) => {
  ensurePurchaseStatusToast();
  if (!purchaseStatusToast) return;
  const message = getPurchaseStatusMessage(latestItem, changedCount);
  if (purchaseStatusToastMessage) purchaseStatusToastMessage.textContent = message;

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

/* Trae órdenes propias con sus productos para consultar estados por producto. */
const fetchPurchaseOrders = async (userId) => {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("orders")
    .select("id, shipping_requested, shipping_status, order_items (product_id)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return data;
};

/* Refresca estados, filtra los no notificables y marca lecturas válidas. */
const refreshPurchaseStatusToast = async (session, { force = false } = {}) => {
  const userId = session?.user?.id ?? "";
  const token = session?.access_token ?? "";
  if (!userId || !token) return;

  const now = Date.now();
  /* Evita ráfagas por eventos realtime sucesivos. */
  if (
    !force &&
    lastPurchaseStatusRefreshUserId === userId &&
    now - lastPurchaseStatusRefreshAt < PURCHASE_STATUS_MIN_REFRESH_MS
  ) {
    return;
  }
  lastPurchaseStatusRefreshUserId = userId;
  lastPurchaseStatusRefreshAt = now;

  const orders = await fetchPurchaseOrders(userId);
  const orderIds = [...new Set(orders.map((order) => String(order?.id ?? "").trim()).filter(Boolean))];
  if (orderIds.length === 0) return;

  const response = await fetch(`/api/purchase-fulfillment?orderIds=${encodeURIComponent(orderIds.join(","))}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  const payload = response ? await response.json().catch(() => ({})) : {};
  if (!response?.ok || !Array.isArray(payload?.items)) return;

  const statusByKey = new Map(
    payload.items.map((item) => [
      getFulfillmentMapKey(item?.orderId, item?.productId),
      {
        fulfillmentStatus: String(item?.fulfillmentStatus ?? "").trim(),
        statusUpdatedAt: String(item?.statusUpdatedAt ?? "").trim(),
        statusRead: Boolean(item?.statusRead),
      },
    ]),
  );

  /* Combina estado real por producto con respaldo de la orden. */
  const currentItems = orders.flatMap((order) => {
    const orderId = String(order?.id ?? "").trim();
    const fallbackStatus = String(order?.shipping_status ?? "").trim();
    const shippingRequested = Boolean(order?.shipping_requested);
    return (Array.isArray(order?.order_items) ? order.order_items : [])
      .map((item) => {
        const productId = String(item?.product_id ?? "").trim();
        if (!orderId || !productId) return null;
        const state = statusByKey.get(getFulfillmentMapKey(orderId, productId));
        return {
          orderId,
          productId,
          shippingRequested,
          fulfillmentStatus: state?.fulfillmentStatus || fallbackStatus || (shippingRequested ? "requested" : "pickup_pending"),
          statusUpdatedAt: state?.statusUpdatedAt || "",
          statusRead: Boolean(state?.statusRead),
        };
      })
      .filter(Boolean);
  });
  if (currentItems.length === 0) return;

  const unreadItems = currentItems.filter((item) => !item.statusRead);
  if (unreadItems.length === 0) return;
  /* Estados base se marcan como leídos sin molestar al comprador. */
  const baselineItems = unreadItems.filter((item) => !shouldNotifyPurchaseStatus(item));
  if (baselineItems.length > 0) {
    await markPurchaseStatusesReadOnServer(token, baselineItems);
  }

  const notifiableUnreadItems = unreadItems.filter(shouldNotifyPurchaseStatus);
  if (notifiableUnreadItems.length === 0) return;

  /* Deduplica por memoria y sessionStorage para no repetir toasts. */
  const unannouncedItems = notifiableUnreadItems.filter((item) => {
    const key = getPurchaseStatusReadKey(item);
    const storageKey = getPurchaseStatusToastStorageKey(item);
    return key && !announcedPurchaseStatusKeys.has(key) && !window.sessionStorage.getItem(storageKey);
  });
  if (unannouncedItems.length === 0) return;

  unannouncedItems.forEach((item) => {
    announcedPurchaseStatusKeys.add(getPurchaseStatusReadKey(item));
    window.sessionStorage.setItem(getPurchaseStatusToastStorageKey(item), "1");
  });
  await markPurchaseStatusesReadOnServer(token, unannouncedItems);
  const latest = unannouncedItems[unannouncedItems.length - 1];
  showPurchaseStatusToast({
    changedCount: unannouncedItems.length,
    latestItem: latest,
  });
};

/* Antirrebote para eventos realtime de orders/sale_dispatches. */
const schedulePurchaseStatusRefresh = () => {
  window.clearTimeout(purchaseRealtimeRefreshTimer);
  purchaseRealtimeRefreshTimer = window.setTimeout(async () => {
    const { data } = await supabase.auth.getSession();
    purchaseRealtimeRefreshTimer = 0;
    await refreshPurchaseStatusToast(data?.session, { force: true });
  }, PURCHASE_REALTIME_REFRESH_DEBOUNCE_MS);
};

/* Suscripción realtime acotada al usuario comprador activo. */
const setupPurchaseStatusRealtime = async (session) => {
  const userId = session?.user?.id ?? "";
  if (!userId || purchaseRealtimeChannel) return;
  purchaseRealtimeUserId = userId;
  purchaseRealtimeChannel = supabase
    .channel(`home-purchase-status-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` },
      schedulePurchaseStatusRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sale_dispatches" },
      schedulePurchaseStatusRefresh,
    )
    .subscribe();
};

/* Limpia timers/canales cuando cambia usuario o la página ya cubre el caso. */
export const teardownPurchaseStatusNotifications = async () => {
  window.clearTimeout(purchaseRealtimeRefreshTimer);
  purchaseRealtimeRefreshTimer = 0;
  purchaseRealtimeUserId = "";
  lastPurchaseStatusRefreshAt = 0;
  lastPurchaseStatusRefreshUserId = "";
  announcedPurchaseStatusKeys.clear();
  if (!purchaseRealtimeChannel) return;
  const channel = purchaseRealtimeChannel;
  purchaseRealtimeChannel = null;
  await supabase.removeChannel(channel);
};

/* Punto de entrada usado por el header para activar o refrescar notificaciones. */
export const refreshPurchaseStatusNotifications = async (session, options = {}) => {
  const userId = session?.user?.id ?? "";
  if (!userId || isPurchasesPageActive()) {
    await teardownPurchaseStatusNotifications();
    return;
  }
  if (purchaseRealtimeUserId && purchaseRealtimeUserId !== userId) {
    await teardownPurchaseStatusNotifications();
  }
  await refreshPurchaseStatusToast(session, options);
  await setupPurchaseStatusRealtime(session);
};
