/* Historial de compras: local o remoto. */
import { supabase } from "../lib/supabaseClient";

/* Clave de órdenes locales offline. */
const ORDERS_KEY = "ab_orders_v1";

/* Referencias DOM. */
let list = document.getElementById("orders-list");
let emptyState = document.getElementById("orders-empty");
let status = document.getElementById("orders-status");
let deleteModal = document.getElementById("orders-delete-modal");
let deleteModalClose = document.querySelector("[data-orders-modal-close]");
let deleteModalCancel = document.querySelector("[data-orders-modal-cancel]");
let deleteModalConfirm = document.querySelector("[data-orders-modal-confirm]");
let pendingDeleteOrderId = "";
let lastOrderDeleteModalTrigger = null;
let currentUserId = "";
let currentSource = "remote";
let currentOrders = [];
let syncInFlight = false;

const refreshOrderNodes = () => {
  list = document.getElementById("orders-list");
  emptyState = document.getElementById("orders-empty");
  status = document.getElementById("orders-status");
  deleteModal = document.getElementById("orders-delete-modal");
  deleteModalClose = document.querySelector("[data-orders-modal-close]");
  deleteModalCancel = document.querySelector("[data-orders-modal-cancel]");
  deleteModalConfirm = document.querySelector("[data-orders-modal-confirm]");
};

const bindOrderEvents = () => {
  refreshOrderNodes();
  if (list && list.dataset.abOrdersClickBound !== "true") {
    list.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("[data-order-delete]");
      if (!(button instanceof HTMLButtonElement)) return;
      const orderId = button.dataset.orderDelete ?? "";
      if (!orderId) return;
      openDeleteModal(orderId);
    });
    list.dataset.abOrdersClickBound = "true";
  }

  if (deleteModalCancel && deleteModalCancel.dataset.abOrdersCancelBound !== "true") {
    deleteModalCancel.addEventListener("click", closeDeleteModal);
    deleteModalCancel.dataset.abOrdersCancelBound = "true";
  }
  if (deleteModalClose && deleteModalClose.dataset.abOrdersCloseBound !== "true") {
    deleteModalClose.addEventListener("click", closeDeleteModal);
    deleteModalClose.dataset.abOrdersCloseBound = "true";
  }
  if (deleteModalConfirm && deleteModalConfirm.dataset.abOrdersConfirmBound !== "true") {
    deleteModalConfirm.addEventListener("click", async () => {
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
    deleteModalConfirm.dataset.abOrdersConfirmBound = "true";
  }

  if (document.documentElement.dataset.abOrdersKeydownBound !== "true") {
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (deleteModal?.classList.contains("ab-is-hidden")) return;
      closeDeleteModal();
    });
    document.documentElement.dataset.abOrdersKeydownBound = "true";
  }
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
    completed: "Completado",
    not_requested: "Sin envío",
  };
  return labels[statusValue] ?? labels.requested;
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

const extractBuyerNote = (order) => {
  const localNote = String(order?.buyer_note ?? "").trim();
  if (localNote) return localNote;
  const detail = String(order?.payment_detail ?? "").trim();
  const marker = "note:";
  const index = detail.indexOf(marker);
  if (index < 0) return "";
  return detail.slice(index + marker.length).trim();
};

const normalizeOrderItemsForInsert = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      product_id: String(item?.product_id ?? "").trim() || null,
      name: String(item?.name ?? "").trim() || "Producto",
      qty: Math.max(1, Number(item?.qty ?? 1)),
      unit_price: Math.max(0, Number(item?.unit_price ?? 0)),
      provider: String(item?.provider ?? "").trim() || null,
      unit: null,
      image: String(item?.image ?? "").trim() || null,
    }))
    .filter((item) => item.name);

const syncLocalOrdersToServer = async (userId) => {
  if (!userId || syncInFlight) return { syncedCount: 0, remainingCount: 0 };
  syncInFlight = true;
  try {
    const raw = window.localStorage.getItem(ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const localOrders = Array.isArray(parsed[userId]) ? parsed[userId] : [];
    if (localOrders.length === 0) {
      return { syncedCount: 0, remainingCount: 0 };
    }

    let syncedCount = 0;
    const remaining = [];

    for (const localOrder of localOrders) {
      const safeItems = normalizeOrderItemsForInsert(localOrder?.order_items);
      if (safeItems.length === 0) continue;

      const orderPayload = {
        user_id: userId,
        status: "approved",
        total_amount: Math.max(0, Number(localOrder?.total_amount ?? 0)),
        currency: String(localOrder?.currency ?? "ARS").trim() || "ARS",
        shipping_full_name: String(localOrder?.shipping_full_name ?? "").trim() || null,
        shipping_address: String(localOrder?.shipping_address ?? "").trim() || null,
        shipping_city: String(localOrder?.shipping_city ?? "").trim() || null,
        shipping_phone: String(localOrder?.shipping_phone ?? "").trim() || null,
        shipping_requested: Boolean(localOrder?.shipping_requested),
        shipping_cost: Math.max(0, Number(localOrder?.shipping_cost ?? 0)),
        shipping_status: String(localOrder?.shipping_status ?? "").trim() || (localOrder?.shipping_requested ? "requested" : "pickup_pending"),
        payment_status: "manual",
        payment_detail: extractBuyerNote(localOrder)
          ? `offline_sync|note:${extractBuyerNote(localOrder)}`
          : "offline_sync",
      };

      const { data: createdOrder, error: createOrderError } = await supabase
        .from("orders")
        .insert(orderPayload)
        .select("id")
        .single();

      if (createOrderError || !createdOrder?.id) {
        remaining.push(localOrder);
        continue;
      }

      const orderItemsPayload = safeItems.map((item) => ({
        order_id: createdOrder.id,
        ...item,
      }));

      const { error: createItemsError } = await supabase.from("order_items").insert(orderItemsPayload);
      if (createItemsError) {
        await supabase.from("orders").delete().eq("id", createdOrder.id);
        remaining.push(localOrder);
        continue;
      }

      syncedCount += 1;
    }

    parsed[userId] = remaining;
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(parsed));
    return { syncedCount, remainingCount: remaining.length };
  } catch {
    return { syncedCount: 0, remainingCount: 0 };
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
const renderHistory = (history = [], providerMetaMap = {}) => {
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
    const orderDate = formatDate(order.created_at);
    const currency = String(order.currency ?? "ARS").trim() || "ARS";
    const shippingRequested = Boolean(order.shipping_requested);
    const shippingCost = Number(order.shipping_cost ?? 0);
    const shippingStatus = formatShippingStatus(order.shipping_status, shippingRequested);
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
      const providerSubtotal = providerItems.reduce(
        (sum, item) => sum + Number(item?.unit_price ?? 0) * Number(item?.qty ?? 1),
        0,
      );

      const card = document.createElement("article");
      card.className = "ab-provider-product-card";
      const coverImage = escapeHtml(String(providerItems[0]?.image ?? "").trim() || "/logo2.svg");
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
          <p class="ab-provider-product-card__price">$${formatPrice(providerSubtotal)} <span>${escapeHtml(currency)}</span></p>
        </div>
        <h2>${providerNameMarkup}</h2>
        <p class="ab-provider-product-card__description">
          ${waLink ? `<a class="ab-order-card__provider-phone-link" href="${waLink}" target="_blank" rel="noreferrer noopener">Contactar por WhatsApp</a>` : "Sin WhatsApp disponible"}
        </p>
        <ul class="ab-provider-product-card__details">
          ${providerItems
            .map((item) => {
              const qty = Number(item?.qty ?? 1);
              const price = Number(item?.unit_price ?? 0);
              const subtotal = price * qty;
              return `<li>Producto: <strong>${escapeHtml(item?.name ?? "Producto")} x ${qty} · $${formatPrice(subtotal)}</strong></li>`;
            })
            .join("")}
          ${
            shippingRequested
              ? `<li>Entrega: <strong>${escapeHtml(shippingStatus)}</strong></li>
                 <li>Costo envío: <strong>$${formatPrice(shippingCost)}</strong></li>
                 <li>Dirección: <strong>${escapeHtml([shippingAddress, shippingCity].filter(Boolean).join(", ") || "Sin dirección")}</strong></li>
                 ${shippingPhone ? `<li>Teléfono: <strong>${escapeHtml(shippingPhone)}</strong></li>` : ""}`
              : `<li>Entrega: <strong>${escapeHtml(shippingStatus)}</strong></li>`
          }
          <li>Total: <strong>$${formatPrice(order.total_amount ?? 0)}</strong></li>
          ${buyerNote ? `<li>Nota: <strong>${escapeHtml(buyerNote)}</strong></li>` : ""}
        </ul>
        <div class="ab-provider-product-card__actions">
          <button type="button" class="ab-provider-product-card__button ab-provider-product-card__button--ghost" data-order-delete="${escapeHtml(orderId)}">
            Borrar compra
          </button>
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

const openDeleteModal = (orderId) => {
  if (!deleteModal || !orderId) return;
  lastOrderDeleteModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  pendingDeleteOrderId = orderId;
  deleteModal.classList.remove("ab-is-hidden");
  deleteModal.setAttribute("aria-hidden", "false");
  deleteModalConfirm?.focus();
};

const closeDeleteModal = () => {
  if (!deleteModal) return;
  if (deleteModal.contains(document.activeElement)) {
    if (lastOrderDeleteModalTrigger instanceof HTMLElement) {
      lastOrderDeleteModalTrigger.focus();
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }
  pendingDeleteOrderId = "";
  lastOrderDeleteModalTrigger = null;
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
  const syncResult = await syncLocalOrdersToServer(userId);
  if (syncResult.syncedCount > 0 && status) {
    status.textContent =
      syncResult.remainingCount > 0
        ? `Sincronizamos ${syncResult.syncedCount} compra(s). Quedan ${syncResult.remainingCount} pendientes por reintentar.`
        : `Sincronizamos ${syncResult.syncedCount} compra(s) locales al servidor.`;
  }

  try {
    const raw = window.localStorage.getItem(ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const localOrders = Array.isArray(parsed[userId]) ? parsed[userId] : [];
    if (localOrders.length > 0) {
      currentSource = "local";
      currentOrders = await hydrateOrderItemImages(localOrders);
      const providerMetaMap = await buildProviderMetaMap(currentOrders);
      if (status) status.textContent = "";
      renderHistory(currentOrders, providerMetaMap);
      renderOrders();
      return;
    }
  } catch {
    // fall through to remote
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
  const safeData = await hydrateOrderItemImages(data ?? []);
  currentSource = "remote";
  currentOrders = safeData;
  const providerMetaMap = await buildProviderMetaMap(safeData);
  renderHistory(safeData, providerMetaMap);
  renderOrders();
};

bindOrderEvents();

document.addEventListener("astro:page-load", () => {
  refreshOrderNodes();
  bindOrderEvents();
  loadOrders();
});
document.addEventListener("astro:after-swap", () => {
  refreshOrderNodes();
  bindOrderEvents();
  loadOrders();
});
window.addEventListener("pageshow", () => {
  refreshOrderNodes();
  bindOrderEvents();
  loadOrders();
});

/* Inicialización. */
loadOrders();
