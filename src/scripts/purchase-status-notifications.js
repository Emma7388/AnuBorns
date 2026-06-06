import { supabase } from "../lib/supabaseClient";

let purchaseStatusToast = null;
let purchaseStatusToastMessage = null;
let purchaseStatusToastTimer = 0;
let purchaseRealtimeChannel = null;
let purchaseRealtimeRefreshTimer = 0;
let purchaseRealtimeUserId = "";
const announcedPurchaseStatusKeys = new Set();

const PURCHASE_REALTIME_REFRESH_DEBOUNCE_MS = 900;

const isHomePage = () => window.location.pathname === "/";
const getFulfillmentMapKey = (orderId, productId) =>
  `${String(orderId ?? "").trim()}::${String(productId ?? "").trim()}`;

const getPurchaseStatusReadKey = (item) =>
  [
    String(item?.orderId ?? "").trim(),
    String(item?.productId ?? "").trim(),
    String(item?.fulfillmentStatus ?? item?.status ?? "").trim(),
  ].join("::");

const markPurchaseStatusesReadOnServer = async (token, items = []) => {
  const reads = (Array.isArray(items) ? items : [])
    .map((item) => ({
      orderId: String(item?.orderId ?? "").trim(),
      productId: String(item?.productId ?? "").trim(),
      fulfillmentStatus: String(item?.fulfillmentStatus ?? item?.status ?? "").trim(),
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

const formatPurchaseStatus = (value, requested) => {
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

const showPurchaseStatusToast = ({ changedCount, latestStatusLabel }) => {
  ensurePurchaseStatusToast();
  if (!purchaseStatusToast) return;
  const safeChangedCount = Math.max(1, Number(changedCount ?? 1));
  const message = safeChangedCount === 1
    ? `Producto actualizado: ${latestStatusLabel || "estado actualizado"}.`
    : `${safeChangedCount} productos actualizaron su estado.`;
  if (purchaseStatusToastMessage) purchaseStatusToastMessage.textContent = message;

  if (purchaseStatusToastTimer) window.clearTimeout(purchaseStatusToastTimer);
  purchaseStatusToast.classList.remove("is-visible");
  window.requestAnimationFrame(() => {
    purchaseStatusToast?.classList.add("is-visible");
  });
  purchaseStatusToastTimer = window.setTimeout(() => {
    purchaseStatusToast?.classList.remove("is-visible");
    purchaseStatusToastTimer = 0;
  }, 2000);
};

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

const refreshPurchaseStatusToast = async (session) => {
  if (!isHomePage()) return;
  const userId = session?.user?.id ?? "";
  const token = session?.access_token ?? "";
  if (!userId || !token) return;

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
        statusRead: Boolean(item?.statusRead),
      },
    ]),
  );

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
          statusRead: Boolean(state?.statusRead),
        };
      })
      .filter(Boolean);
  });
  if (currentItems.length === 0) return;

  if (!payload.hasAnyRead) {
    await markPurchaseStatusesReadOnServer(token, currentItems);
    return;
  }

  const unreadItems = currentItems.filter((item) => !item.statusRead);
  if (unreadItems.length === 0) return;

  const unannouncedItems = unreadItems.filter((item) => {
    const key = getPurchaseStatusReadKey(item);
    return key && !announcedPurchaseStatusKeys.has(key);
  });
  if (unannouncedItems.length === 0) return;

  unannouncedItems.forEach((item) => announcedPurchaseStatusKeys.add(getPurchaseStatusReadKey(item)));
  const latest = unannouncedItems[unannouncedItems.length - 1];
  showPurchaseStatusToast({
    changedCount: unannouncedItems.length,
    latestStatusLabel: formatPurchaseStatus(latest.fulfillmentStatus, latest.shippingRequested),
  });
};

const schedulePurchaseStatusRefresh = () => {
  window.clearTimeout(purchaseRealtimeRefreshTimer);
  purchaseRealtimeRefreshTimer = window.setTimeout(async () => {
    const { data } = await supabase.auth.getSession();
    await refreshPurchaseStatusToast(data?.session);
  }, PURCHASE_REALTIME_REFRESH_DEBOUNCE_MS);
};

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

export const teardownPurchaseStatusNotifications = async () => {
  window.clearTimeout(purchaseRealtimeRefreshTimer);
  purchaseRealtimeRefreshTimer = 0;
  purchaseRealtimeUserId = "";
  announcedPurchaseStatusKeys.clear();
  if (!purchaseRealtimeChannel) return;
  const channel = purchaseRealtimeChannel;
  purchaseRealtimeChannel = null;
  await supabase.removeChannel(channel);
};

export const refreshHomePurchaseStatus = async (session) => {
  const userId = session?.user?.id ?? "";
  if (!isHomePage() || !userId) {
    await teardownPurchaseStatusNotifications();
    return;
  }
  if (purchaseRealtimeUserId && purchaseRealtimeUserId !== userId) {
    await teardownPurchaseStatusNotifications();
  }
  await refreshPurchaseStatusToast(session);
  await setupPurchaseStatusRealtime(session);
};
