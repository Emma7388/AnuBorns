/* Header: gestión de sesión, avatar, logout y sincronización de carrito. */
import { supabase } from "../lib/supabaseClient";
import { postAudit } from "./audit.js";
import { getCart, syncCartOnLogin } from "../lib/cart";
import { fetchSalesSummary } from "../lib/salesSummaryClient";

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
const LAST_SEEN_SALE_KEY = "ab_last_seen_sale_at_v1";

/* Modal de confirmación para cerrar sesión. */
const openModal = () => {
  if (!logoutModal) return;
  logoutModal.classList.remove("ab-is-hidden");
  logoutModal.setAttribute("aria-hidden", "false");
  modalConfirm?.focus();
};

const closeModal = () => {
  if (!logoutModal) return;
  logoutModal.classList.add("ab-is-hidden");
  logoutModal.setAttribute("aria-hidden", "true");
  logoutButton?.focus();
};

/* Obtiene un nombre corto para mostrar en el header. */
const getDisplayName = (authUser) => {
  if (!authUser) return "";
  const meta = authUser.user_metadata ?? {};
  const firstName = String(meta.first_name ?? "").trim();
  if (firstName) return firstName;
  const email = String(authUser.email ?? "").trim();
  if (!email) return "";
  return email.split("@")[0] || email;
};

/* Muestra u oculta la UI según estado de sesión. */
const setView = (session) => {
  if (!guest || !user) return;
  if (session?.user) {
    guest.classList.add("ab-is-hidden");
    user.classList.remove("ab-is-hidden");
    const avatarUrl = session.user.user_metadata?.avatar_url;
    if (nameLabel) {
      nameLabel.textContent = getDisplayName(session.user);
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

/* Re-bindea elementos tras navegación SPA. */
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
const renderCartCount = async () => {
  if (!cartCount) return;
  try {
    const items = await getCart();
    const totalQty = items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
    cartCount.textContent = String(totalQty);
  } catch {
    cartCount.textContent = "0";
  }
};

const getLastSeenSaleStorageKey = (userId) => `${LAST_SEEN_SALE_KEY}:${userId || "anonymous"}`;

const setSalesNotificationVisible = (visible) => {
  if (!salesNotificationDot) return;
  if (visible) {
    salesNotificationDot.classList.remove("ab-is-hidden");
    return;
  }
  salesNotificationDot.classList.add("ab-is-hidden");
};

const getLatestSaleCursor = (items) => {
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

const refreshSalesNotification = async (session) => {
  const userId = session?.user?.id ?? "";
  const token = session?.access_token ?? "";
  if (!userId || !token) {
    setSalesNotificationVisible(false);
    return;
  }

  if (window.location.pathname === "/mis-ventas") {
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
    const latestCursor = getLatestSaleCursor(items);
    if (!latestCursor) {
      setSalesNotificationVisible(false);
      return;
    }

    const storageKey = getLastSeenSaleStorageKey(userId);
    const previousCursor = window.localStorage.getItem(storageKey);
    if (!previousCursor) {
      window.localStorage.setItem(storageKey, latestCursor);
      setSalesNotificationVisible(false);
      return;
    }

    setSalesNotificationVisible(previousCursor !== latestCursor);
  } catch {
    setSalesNotificationVisible(false);
  }
};

/* Resuelve la sesión actual y sincroniza carrito si aplica. */
const resolveSession = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session) {
    setView(sessionData.session);
    const userId = sessionData.session.user?.id ?? "";
    if (userId && userId !== lastSyncedUserId) {
      lastSyncedUserId = userId;
      if (cartSync) cartSync.classList.remove("ab-is-hidden");
      await syncCartOnLogin(userId);
      if (cartSync) cartSync.classList.add("ab-is-hidden");
    }
    await refreshSalesNotification(sessionData.session);
    renderCartCount();
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    setView({ user: userData.user });
    const userId = userData.user?.id ?? "";
    if (userId && userId !== lastSyncedUserId) {
      lastSyncedUserId = userId;
      if (cartSync) cartSync.classList.remove("ab-is-hidden");
      await syncCartOnLogin(userId);
      if (cartSync) cartSync.classList.add("ab-is-hidden");
    }
    await refreshSalesNotification({ user: userData.user, access_token: sessionData?.session?.access_token ?? "" });
    renderCartCount();
    return;
  }

  setView(null);
  setSalesNotificationVisible(false);
  renderCartCount();
};

/* Inicializa listeners y UI del header. */
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
  renderCartCount();
};

/* Reacciona a cambios de auth (login/logout). */
supabase.auth.onAuthStateChange((_event, session) => {
  setView(session);
  const userId = session?.user?.id ?? "";
  if (userId && userId !== lastSyncedUserId) {
    lastSyncedUserId = userId;
    if (cartSync) cartSync.classList.remove("ab-is-hidden");
    syncCartOnLogin(userId).finally(() => {
      if (cartSync) cartSync.classList.add("ab-is-hidden");
      refreshSalesNotification(session);
      renderCartCount();
    });
  } else {
    refreshSalesNotification(session);
    renderCartCount();
  }
});

/* Cierra modal con Escape. */
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});

/* Re-inicializa en eventos de navegación Astro. */
initHeaderAuth();
document.addEventListener("astro:page-load", initHeaderAuth);
document.addEventListener("astro:after-swap", initHeaderAuth);
window.addEventListener("pageshow", initHeaderAuth);
window.addEventListener("ab-cart-updated", () => {
  renderCartCount();
});
document.addEventListener("ab-cart-updated", () => {
  renderCartCount();
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
