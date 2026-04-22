/* Historial de compras: local o remoto. */
import { supabase } from "../lib/supabaseClient";

/* Clave de órdenes locales offline. */
const ORDERS_KEY = "ab_orders_v1";

/* Referencias DOM. */
const list = document.getElementById("orders-list");
const emptyState = document.getElementById("orders-empty");
const status = document.getElementById("orders-status");
const deleteModal = document.getElementById("orders-delete-modal");
const deleteModalClose = document.querySelector("[data-orders-modal-close]");
const deleteModalCancel = document.querySelector("[data-orders-modal-cancel]");
const deleteModalConfirm = document.querySelector("[data-orders-modal-confirm]");
let pendingDeleteOrderId = "";
let currentUserId = "";
let currentSource = "remote";
let currentOrders = [];

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

const buildWhatsappUrl = (provider, phone) => {
  const digits = toWhatsappDigits(phone);
  if (!digits) return "";
  const message = encodeURIComponent(`Hola ${provider}, te contacto por una compra en AnuBorns.`);
  return `https://wa.me/${digits}?text=${message}`;
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

  /* Fallback amplio para matchear nombres con pequeñas diferencias. */
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

/* Renderiza lista de órdenes en el DOM. */
const renderHistory = (history = [], providerMetaMap = {}) => {
  if (!list) return;
  list.innerHTML = "";

  if (!Array.isArray(history) || history.length === 0) {
    return;
  }

  history.forEach((order) => {
    const orderId = String(order.id ?? "");
    const wrapper = document.createElement("article");
    wrapper.className = "ab-order-card";
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    const providers = [
      ...new Set(items.map((item) => String(item.provider ?? "N/A").trim()).filter(Boolean)),
    ];
    const providersMarkup = providers
      .map((provider) => {
        const userIdFromItem = items.find(
          (item) => String(item?.provider ?? "").trim() === provider && String(item?.provider_user_id ?? "").trim()
        )?.provider_user_id;
        const phoneFromItem = items.find(
          (item) => String(item?.provider ?? "").trim() === provider && toWhatsappDigits(item?.provider_whatsapp)
        )?.provider_whatsapp;
        const providerKey = normalizeProviderKey(provider);
        const providerMeta = providerMetaMap[providerKey] ?? { phone: "", userId: "" };
        const providerPhone = toWhatsappDigits(phoneFromItem) || providerMeta.phone || "";
        const providerUserId = String(userIdFromItem ?? "").trim() || providerMeta.userId || "";
        const waLink = buildWhatsappUrl(provider, providerPhone);
        const providerProfileHref = providerUserId ? `/proveedor-publico/${encodeURIComponent(providerUserId)}` : "";

        if (!providerProfileHref && !waLink) {
          return `
            <span class="ab-order-card__provider-link ab-order-card__provider-link--disabled">
              <span class="ab-order-card__seller-name">${escapeHtml(provider)}</span>
              <span class="ab-order-card__provider-wa-icon" aria-hidden="true">☎</span>
            </span>
          `;
        }
        return `
          <span class="ab-order-card__provider-wrap">
            ${
              providerProfileHref
                ? `<a class="ab-order-card__provider-link" href="${providerProfileHref}">
                     <span class="ab-order-card__seller-name">${escapeHtml(provider)}</span>
                   </a>`
                : `<span class="ab-order-card__provider-link ab-order-card__provider-link--disabled">
                     <span class="ab-order-card__seller-name">${escapeHtml(provider)}</span>
                   </span>`
            }
            ${
              waLink
                ? `<a
                     class="ab-order-card__provider-phone-link"
                     href="${waLink}"
                     target="_blank"
                     rel="noreferrer noopener"
                     aria-label="Contactar por WhatsApp a ${escapeHtml(provider)}"
                     title="Contactar por WhatsApp"
                   >
                     <span class="ab-order-card__provider-wa-icon" aria-hidden="true">☎</span>
                   </a>`
                : `<span class="ab-order-card__provider-phone-link ab-order-card__provider-phone-link--disabled" aria-hidden="true">
                     <span class="ab-order-card__provider-wa-icon" aria-hidden="true">☎</span>
                   </span>`
            }
          </span>
        `;
      })
      .join(" ");
    wrapper.innerHTML = `
      <div class="ab-order-card__header">
        <div>
          <p class="ab-order-card__label">Orden ${orderId.slice(0, 8)}</p>
          <p class="ab-order-card__date">${formatDate(order.created_at)}</p>
          <p>${providersMarkup}</p>
        </div>
        <strong>$${formatPrice(order.total_amount ?? 0)}</strong>
      </div>
      <ul class="ab-order-card__items">
        ${items
          .map((item) => {
            const qty = item.qty ?? 1;
            const price = Number(item.unit_price ?? 0);
            return `
              <li>
                <div>
                  <strong>${item.name} x ${qty}</strong>
                </div>
                <span>$${formatPrice(price * qty)}</span>
              </li>
            `;
          })
          .join("")}
      </ul>
      <div class="ab-order-card__actions">
        <button type="button" class="ab-orders-delete-btn" data-order-delete="${escapeHtml(orderId)}">
          Borrar compra
        </button>
      </div>
    `;
    list.appendChild(wrapper);
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

const openDeleteModal = (orderId) => {
  if (!deleteModal || !orderId) return;
  pendingDeleteOrderId = orderId;
  deleteModal.classList.remove("ab-is-hidden");
  deleteModal.setAttribute("aria-hidden", "false");
  deleteModalConfirm?.focus();
};

const closeDeleteModal = () => {
  if (!deleteModal) return;
  pendingDeleteOrderId = "";
  deleteModal.classList.add("ab-is-hidden");
  deleteModal.setAttribute("aria-hidden", "true");
};

const deleteOrder = async (orderId) => {
  if (!orderId) return false;

  if (currentSource === "local" && currentUserId) {
    const raw = window.localStorage.getItem(ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const localOrders = Array.isArray(parsed[currentUserId]) ? parsed[currentUserId] : [];
    parsed[currentUserId] = localOrders.filter((order) => String(order?.id ?? "") !== orderId);
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(parsed));
    currentOrders = parsed[currentUserId];
  } else {
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId)
      .eq("user_id", currentUserId);
    if (error) {
      if (status) status.textContent = `No se pudo borrar la compra: ${error.message}`;
      return false;
    }
    currentOrders = currentOrders.filter((order) => String(order?.id ?? "") !== orderId);
  }

  const providerMetaMap = await buildProviderMetaMap(currentOrders);
  renderHistory(currentOrders, providerMetaMap);
  renderOrders();
  if (status) status.textContent = "";
  return true;
};

/* Carga órdenes locales o desde Supabase. */
const loadOrders = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) {
    if (status) status.textContent = "Tenés que iniciar sesión para ver tus compras.";
    window.location.href = "/login?returnTo=/mis-compras";
    return;
  }

  /* Primero intenta usar órdenes locales guardadas. */
  const userId = sessionData.session.user.id;
  currentUserId = userId;
  try {
    const raw = window.localStorage.getItem(ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const localOrders = Array.isArray(parsed[userId]) ? parsed[userId] : [];
    if (localOrders.length > 0) {
      currentSource = "local";
      currentOrders = localOrders;
      const providerMetaMap = await buildProviderMetaMap(localOrders);
      if (status) status.textContent = "";
      renderHistory(localOrders, providerMetaMap);
      renderOrders();
      return;
    }
  } catch {
    // fall through to remote
  }

  /* Si no hay locales, trae órdenes remotas. */
  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, total_amount, status, order_items (product_id, name, qty, unit_price, provider)")
    .order("created_at", { ascending: false });

  if (error) {
    const rawMessage = String(error.message ?? "");
    const missingOrdersTable =
      rawMessage.includes("public.orders") ||
      rawMessage.includes("relation \"orders\" does not exist") ||
      rawMessage.includes("schema cache");

    if (missingOrdersTable) {
      currentSource = "remote";
      currentOrders = [];
      renderHistory([], {});
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

  if (status) status.textContent = "";
  const safeData = data ?? [];
  currentSource = "remote";
  currentOrders = safeData;
  const providerMetaMap = await buildProviderMetaMap(safeData);
  renderHistory(safeData, providerMetaMap);
  renderOrders();
};

if (list) {
  list.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("[data-order-delete]");
    if (!(button instanceof HTMLButtonElement)) return;
    const orderId = button.dataset.orderDelete ?? "";
    if (!orderId) return;
    openDeleteModal(orderId);
  });
}

deleteModalCancel?.addEventListener("click", closeDeleteModal);
deleteModalClose?.addEventListener("click", closeDeleteModal);
deleteModalConfirm?.addEventListener("click", async () => {
  const orderId = pendingDeleteOrderId;
  if (!orderId) return;
  if (deleteModalConfirm instanceof HTMLButtonElement) {
    deleteModalConfirm.disabled = true;
    deleteModalConfirm.setAttribute("aria-busy", "true");
  }
  const deleted = await deleteOrder(orderId);
  if (deleteModalConfirm instanceof HTMLButtonElement) {
    deleteModalConfirm.disabled = false;
    deleteModalConfirm.removeAttribute("aria-busy");
  }
  if (deleted) closeDeleteModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (deleteModal?.classList.contains("ab-is-hidden")) return;
  closeDeleteModal();
});

/* Inicialización. */
loadOrders();
