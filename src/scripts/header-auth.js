/* Header: gestión de sesión, avatar, logout y sincronización de carrito. */
import { supabase } from "../lib/supabaseClient";
import { postAudit } from "./audit.js";
import { getCartCount, syncCartOnLogin } from "../lib/cart";
import { fetchSalesSummary, invalidateSalesSummaryCache } from "../lib/salesSummaryClient";
import { uploadPendingAvatar, withAvatarUrl } from "../lib/pendingAvatar";
import {
  fetchUserProfile,
  getDisplayNameFromProfile,
  resolvePendingRegistrationProfile,
} from "../lib/userProfile";
import { refreshPurchaseStatusNotifications, teardownPurchaseStatusNotifications } from "./purchase-status-notifications.js";

/* Referencias DOM (se recalculan en cada navegación). */
let guest = document.querySelector('[data-auth="guest"]');
let user = document.querySelector('[data-auth="user"]');
let avatarImg = document.getElementById("auth-avatar");
let nameLabel = document.getElementById("auth-name");
let logoutButton = document.getElementById("auth-logout");
let logoutModal = document.getElementById("logout-modal");
let modalCancel = document.querySelector("[data-modal-cancel]");
let modalConfirm = document.querySelector("[data-modal-confirm]");
let modalClose = document.querySelector("[data-modal-close]");
let cartCount = document.getElementById("cart-count");
let cartSync = document.getElementById("cart-sync");
let salesNotificationDot = document.getElementById("sales-notification-dot");
let isSigningOut = false;
let lastSyncedUserId = "";
let cartSyncTimeout = 0;
let salesRealtimeChannel = null;
let salesRealtimeUserId = "";
let salesRealtimeRefreshTimer = 0;
let salesNoticeToast = null;
let salesNoticeToastMessage = null;
let salesNoticeToastTimer = 0;
const LAST_SEEN_SALE_KEY = "ab_last_seen_sale_at_v1";
const SALES_NOTICE_SHOWN_KEY = "ab_sales_notice_shown_v1";
const SALES_REALTIME_REFRESH_DEBOUNCE_MS = 900;
const HEADER_BACKGROUND_TIMEOUT_MS = 1600;

const isSalesPageActive = () => window.location.pathname === "/mis-ventas";

const runWhenIdle = (callback) => {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(callback, { timeout: HEADER_BACKGROUND_TIMEOUT_MS });
    return;
  }
  window.setTimeout(callback, 0);
};

/* Modal de confirmación para cerrar sesión. */
const openModal = () => {
  if (!logoutModal) return;
  logoutModal.classList.remove("ab-is-hidden");
  logoutModal.setAttribute("aria-hidden", "false");
  modalConfirm?.focus();
};

const closeModal = () => {
  if (!logoutModal) return;
  if (logoutModal.contains(document.activeElement)) {
    if (logoutButton instanceof HTMLElement) {
      logoutButton.focus();
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }
  logoutModal.classList.add("ab-is-hidden");
  logoutModal.setAttribute("aria-hidden", "true");
};

/* Obtiene un nombre corto para mostrar en el header. */
const getDisplayName = (authUser, profile = {}) => getDisplayNameFromProfile(authUser, profile);

/* Muestra u oculta la interfaz según estado de sesión. */
const setView = (session, profile = {}) => {
  if (!guest || !user) return;
  if (session?.user) {
    guest.classList.add("ab-is-hidden");
    user.classList.remove("ab-is-hidden");
    const avatarUrl = session.user.user_metadata?.avatar_url;
    if (nameLabel) {
      nameLabel.textContent = getDisplayName(session.user, profile);
    }
    if (avatarImg) {
      if (avatarUrl) {
        avatarImg.src = avatarUrl;
        avatarImg.style.display = "block";
      } else {
        avatarImg.removeAttribute("src");
        avatarImg.style.display = "none";
      }
    }
  } else {
    user.classList.add("ab-is-hidden");
    guest.classList.remove("ab-is-hidden");
    if (nameLabel) {
      nameLabel.textContent = "";
    }
  }
};

/* Vuelve a vincular elementos tras navegación de Astro. */
const bindElements = () => {
  guest = document.querySelector('[data-auth="guest"]');
  user = document.querySelector('[data-auth="user"]');
  avatarImg = document.getElementById("auth-avatar");
  nameLabel = document.getElementById("auth-name");
  logoutButton = document.getElementById("auth-logout");
  logoutModal = document.getElementById("logout-modal");
  modalCancel = document.querySelector("[data-modal-cancel]");
  modalConfirm = document.querySelector("[data-modal-confirm]");
  modalClose = document.querySelector("[data-modal-close]");
  cartCount = document.getElementById("cart-count");
  cartSync = document.getElementById("cart-sync");
  salesNotificationDot = document.getElementById("sales-notification-dot");
};

/* Evita registrar listeners duplicados. */
const bindOnce = (element, key, eventName, handler) => {
  if (!element) return;
  const flag = `abBound${key}`;
  if (element.dataset[flag]) return;
  element.addEventListener(eventName, handler);
  element.dataset[flag] = "true";
};

/* Calcula y pinta el total de items del carrito. */
const renderCartCount = async (session = null) => {
  if (!cartCount) return;
  try {
    const totalQty = await getCartCount(session?.user?.id ?? null);
    cartCount.textContent = String(totalQty);
  } catch {
    cartCount.textContent = "0";
  }
};

const showCartSyncMessage = (message, durationMs = 3000) => {
  if (!cartSync) return;
  if (cartSyncTimeout) {
    window.clearTimeout(cartSyncTimeout);
    cartSyncTimeout = 0;
  }
  cartSync.textContent = message;
  cartSync.classList.remove("ab-is-hidden");
  cartSyncTimeout = window.setTimeout(() => {
    if (!cartSync) return;
    cartSync.classList.add("ab-is-hidden");
    cartSync.textContent = "Sincronizando";
    cartSyncTimeout = 0;
  }, durationMs);
};

const getLastSeenSaleStorageKey = (userId) => `${LAST_SEEN_SALE_KEY}:${userId || "anonymous"}`;
const getSalesNoticeShownStorageKey = (userId, cursor) =>
  `${SALES_NOTICE_SHOWN_KEY}:${userId || "anonymous"}:${String(cursor ?? "").trim()}`;

const setSalesNotificationVisible = (visible) => {
  if (!salesNotificationDot) return;
  if (visible) {
    salesNotificationDot.classList.remove("ab-is-hidden");
    return;
  }
  salesNotificationDot.classList.add("ab-is-hidden");
};

const getSalesNotificationCursor = (items) => {
  if (!Array.isArray(items) || items.length === 0) return "";
  let latest = null;
  let latestTime = 0;
  items.forEach((item) => {
    const soldAt = String(item?.lastSoldAt ?? "").trim();
    if (!soldAt) return;
    const soldAtTime = new Date(soldAt).getTime();
    if (Number.isNaN(soldAtTime)) return;
    if (!latest || soldAtTime > latestTime) {
      latest = item;
      latestTime = soldAtTime;
    }
  });
  if (!latest) return "";
  return `${String(latest.lastSoldAt ?? "").trim()}|${String(latest.lastOrderId ?? "").trim()}`;
};

const normalizeSaleCursor = (value) => String(value ?? "").split("::")[0] || "";

const ensureSalesNoticeToast = () => {
  if (salesNoticeToast) return;
  salesNoticeToast = document.createElement("div");
  salesNoticeToast.className = "ab-cart-toast ab-sales-status-toast";
  salesNoticeToast.setAttribute("role", "status");
  salesNoticeToast.setAttribute("aria-live", "polite");
  salesNoticeToast.setAttribute("aria-atomic", "true");
  salesNoticeToast.innerHTML = `
    <span class="ab-cart-toast__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
    <span class="ab-cart-toast__message">Nueva compra recibida</span>
    <a class="ab-cart-toast__link" href="/mis-ventas">Ver</a>
  `;
  document.body.appendChild(salesNoticeToast);
  salesNoticeToastMessage = salesNoticeToast.querySelector(".ab-cart-toast__message");
};

const showSalesNoticeToast = ({ userId, cursor, message }) => {
  const safeCursor = String(cursor ?? "").trim();
  if (!userId || !safeCursor || window.location.pathname === "/mis-ventas") return;
  const storageKey = getSalesNoticeShownStorageKey(userId, safeCursor);
  if (window.sessionStorage.getItem(storageKey)) return;
  window.sessionStorage.setItem(storageKey, "1");

  ensureSalesNoticeToast();
  if (!salesNoticeToast) return;
  if (salesNoticeToastMessage) salesNoticeToastMessage.textContent = message;
  if (salesNoticeToastTimer) window.clearTimeout(salesNoticeToastTimer);
  salesNoticeToast.classList.remove("is-visible");
  window.requestAnimationFrame(() => {
    salesNoticeToast?.classList.add("is-visible");
  });
  salesNoticeToastTimer = window.setTimeout(() => {
    salesNoticeToast?.classList.remove("is-visible");
    salesNoticeToastTimer = 0;
  }, 5000);
};

const refreshSalesNotification = async (session) => {
  const userId = session?.user?.id ?? "";
  const token = session?.access_token ?? "";
  if (!userId || !token) {
    setSalesNotificationVisible(false);
    return;
  }

  if (isSalesPageActive()) {
    setSalesNotificationVisible(false);
    return;
  }

  try {
    const payload = await fetchSalesSummary(token);
    if (payload.error) {
      setSalesNotificationVisible(false);
      return;
    }

    const items = payload.items;
    const latestCursor = getSalesNotificationCursor(items);
    if (!latestCursor) {
      setSalesNotificationVisible(false);
      return;
    }

    const storageKey = getLastSeenSaleStorageKey(userId);
    const previousCursor = window.localStorage.getItem(storageKey);
    if (!previousCursor) {
      setSalesNotificationVisible(true);
      showSalesNoticeToast({
        userId,
        cursor: latestCursor,
        message: "Nueva compra recibida.",
      });
      return;
    }

    const hasUnseenSale = normalizeSaleCursor(previousCursor) !== latestCursor;
    setSalesNotificationVisible(hasUnseenSale);
    if (hasUnseenSale) {
      showSalesNoticeToast({
        userId,
        cursor: latestCursor,
        message: "Nueva compra recibida.",
      });
    }
  } catch {
    setSalesNotificationVisible(false);
  }
};

const scheduleSalesRealtimeRefresh = () => {
  window.clearTimeout(salesRealtimeRefreshTimer);
  salesRealtimeRefreshTimer = window.setTimeout(async () => {
    salesRealtimeRefreshTimer = 0;
    try {
      invalidateSalesSummaryCache();
      const { data } = await supabase.auth.getSession();
      await refreshSalesNotification(data?.session);
    } catch {
      setSalesNotificationVisible(false);
    }
  }, SALES_REALTIME_REFRESH_DEBOUNCE_MS);
};

const teardownSalesRealtime = async () => {
  window.clearTimeout(salesRealtimeRefreshTimer);
  salesRealtimeRefreshTimer = 0;
  salesRealtimeUserId = "";
  if (!salesRealtimeChannel) return;
  const channel = salesRealtimeChannel;
  salesRealtimeChannel = null;
  try {
    await supabase.removeChannel(channel);
  } catch {
    /* Sin acción: si no hay cursor previo, no hace falta limpiar notificaciones. */
  }
};

const setupSalesRealtime = async (session) => {
  const userId = session?.user?.id ?? "";
  if (!userId || isSalesPageActive()) {
    await teardownSalesRealtime();
    return;
  }
  if (salesRealtimeChannel && salesRealtimeUserId === userId) return;
  if (salesRealtimeChannel) {
    await teardownSalesRealtime();
  }
  salesRealtimeUserId = userId;
  salesRealtimeChannel = supabase
    .channel(`ab-header-sales-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "products", filter: `user_id=eq.${userId}` },
      scheduleSalesRealtimeRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sale_dispatches", filter: `seller_id=eq.${userId}` },
      scheduleSalesRealtimeRefresh,
    )
    .subscribe();
};

const resolvePendingAvatar = async (session) => {
  const result = await uploadPendingAvatar(session).catch(() => ({ ok: false, avatarUrl: "" }));
  return result?.avatarUrl ? withAvatarUrl(session, result.avatarUrl) : session;
};

const resolvePrivateProfile = async (session) => {
  await resolvePendingRegistrationProfile(session).catch(() => ({ ok: false }));
  return fetchUserProfile(session?.user);
};

const syncHeaderBackgroundState = async (session) => {
  const userId = session?.user?.id ?? "";
  if (userId && userId !== lastSyncedUserId) {
    lastSyncedUserId = userId;
    if (cartSync) cartSync.classList.remove("ab-is-hidden");
    await syncCartOnLogin(userId);
    if (cartSync && !cartSyncTimeout) cartSync.classList.add("ab-is-hidden");
    await renderCartCount(session);
  }
  await refreshSalesNotification(session);
  await setupSalesRealtime(session);
  await refreshPurchaseStatusNotifications(session);
};

/* Resuelve la sesión actual y sincroniza carrito si aplica. */
const resolveSession = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session) {
    const session = await resolvePendingAvatar(sessionData.session);
    setView(session);
    renderCartCount(session);
    resolvePrivateProfile(session).then((profile) => setView(session, profile)).catch(() => {});
    runWhenIdle(() => {
      syncHeaderBackgroundState(session).catch(() => {});
    });
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    const fallbackSession = { user: userData.user, access_token: sessionData?.session?.access_token ?? "" };
    setView(fallbackSession);
    renderCartCount(fallbackSession);
    fetchUserProfile(userData.user).then((profile) => setView(fallbackSession, profile)).catch(() => {});
    runWhenIdle(() => {
      syncHeaderBackgroundState(fallbackSession).catch(() => {});
    });
    return;
  }

  setView(null);
  setSalesNotificationVisible(false);
  void teardownSalesRealtime();
  void teardownPurchaseStatusNotifications();
  renderCartCount();
};

/* Inicializa listeners e interfaz del header. */
const initHeaderAuth = () => {
  bindElements();
  if (!guest || !user) return;

  /* Eventos del modal de logout. */
  bindOnce(logoutButton, "LogoutClick", "click", () => {
    openModal();
  });
  bindOnce(modalCancel, "ModalCancel", "click", () => {
    closeModal();
  });
  bindOnce(modalClose, "ModalClose", "click", () => {
    closeModal();
  });
  bindOnce(modalConfirm, "ModalConfirm", "click", async () => {
    if (isSigningOut) return;
    isSigningOut = true;
    /* Bloquea el botón para evitar dobles envíos. */
    if (modalConfirm instanceof HTMLButtonElement) {
      modalConfirm.disabled = true;
      modalConfirm.setAttribute("aria-busy", "true");
    }
    try {
      /* Audit y cierre de sesión. */
      await postAudit("logout");
      await supabase.auth.signOut();
      window.location.replace("/");
    } catch {
      closeModal();
    } finally {
      if (modalConfirm instanceof HTMLButtonElement) {
        modalConfirm.disabled = false;
        modalConfirm.removeAttribute("aria-busy");
      }
      isSigningOut = false;
    }
  });

  /* Estado inicial. */
  resolveSession();
};

const bindHeaderAuthEvents = () => {
  if (document.documentElement.dataset.abHeaderAuthEventsBound === "true") return;
  document.documentElement.dataset.abHeaderAuthEventsBound = "true";

  /* Reacciona a cambios de auth (login/logout). */
  supabase.auth.onAuthStateChange(async (_event, incomingSession) => {
    const session = await resolvePendingAvatar(incomingSession);
    setView(session);
    resolvePrivateProfile(session).then((profile) => setView(session, profile)).catch(() => {});
    const userId = session?.user?.id ?? "";
    if (userId && userId !== lastSyncedUserId) {
      lastSyncedUserId = userId;
      if (cartSync) cartSync.classList.remove("ab-is-hidden");
      syncCartOnLogin(userId).finally(() => {
        if (cartSync && !cartSyncTimeout) cartSync.classList.add("ab-is-hidden");
        renderCartCount(session);
        runWhenIdle(() => {
          refreshSalesNotification(session);
          setupSalesRealtime(session);
          refreshPurchaseStatusNotifications(session);
        });
      });
    } else {
      renderCartCount();
      runWhenIdle(() => {
        refreshSalesNotification(session);
        setupSalesRealtime(session);
        refreshPurchaseStatusNotifications(session);
      });
    }
  });

  /* Cierra modal con Escape. */
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });

  /* Re-inicializa en eventos de navegación Astro. */
  document.addEventListener("astro:page-load", initHeaderAuth);
  document.addEventListener("astro:after-swap", initHeaderAuth);
  window.addEventListener("pageshow", initHeaderAuth);
  window.addEventListener("pagehide", teardownSalesRealtime);
  window.addEventListener("ab-cart-updated", () => {
    renderCartCount();
  });
  window.addEventListener("ab-cart-own-items-removed", (event) => {
    const count = Number(event?.detail?.count ?? 0);
    if (!count) return;
    const message = count === 1
      ? "Se quitó un producto propio del carrito."
      : `Se quitaron ${count} productos propios del carrito.`;
    showCartSyncMessage(message, 3000);
  });

  /* Sincroniza sesión cuando cambia en otra pestaña. */
  window.addEventListener("storage", (event) => {
    if (!event.key) return;
    if (
      event.key.includes("supabase.auth.token") ||
      event.key === "ab_auth_refresh" ||
      event.key.includes("ab_last_seen_sale_at_v1")
    ) {
      resolveSession();
    }
  });
};

initHeaderAuth();
bindHeaderAuthEvents();
