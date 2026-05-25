/* Mis ventas: render de productos publicados por el usuario. */
import { supabase } from "../lib/supabaseClient";
import { fetchSalesSummary, invalidateSalesSummaryCache } from "../lib/salesSummaryClient";

/* Referencias DOM. */
let soldProductsList = document.getElementById("my-sold-products-list");
let soldProductsEmpty = document.getElementById("my-sold-products-empty");
let soldProductsStatus = document.getElementById("my-sold-products-status");
let soldProductsDispatchFilter = document.getElementById("my-sold-products-dispatch-filter");
let productsGrid = document.getElementById("my-products-grid");
let productsEmpty = document.getElementById("my-products-empty");
let deleteModal = document.getElementById("sales-delete-modal");
let deleteModalClose = document.querySelector("[data-sales-modal-close]");
let deleteModalCancel = document.querySelector("[data-sales-modal-cancel]");
let deleteModalConfirm = document.querySelector("[data-sales-modal-confirm]");
let currentUserId = "";
let modalKeyDownBound = false;

const refreshMySalesNodes = () => {
  soldProductsList = document.getElementById("my-sold-products-list");
  soldProductsEmpty = document.getElementById("my-sold-products-empty");
  soldProductsStatus = document.getElementById("my-sold-products-status");
  soldProductsDispatchFilter = document.getElementById("my-sold-products-dispatch-filter");
  productsGrid = document.getElementById("my-products-grid");
  productsEmpty = document.getElementById("my-products-empty");
  deleteModal = document.getElementById("sales-delete-modal");
  deleteModalClose = document.querySelector("[data-sales-modal-close]");
  deleteModalCancel = document.querySelector("[data-sales-modal-cancel]");
  deleteModalConfirm = document.querySelector("[data-sales-modal-confirm]");
};

const bindMySalesEvents = () => {
  refreshMySalesNodes();
  if (productsGrid && productsGrid.dataset.abMySalesProductsBound !== "true") {
    productsGrid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("[data-delete-product]");
      if (!(button instanceof HTMLButtonElement)) return;
      const productId = button.dataset.deleteProduct ?? "";
      if (!productId) return;
      openDeleteModal(productId, button);
    });
    productsGrid.dataset.abMySalesProductsBound = "true";
  }

  if (soldProductsList && soldProductsList.dataset.dispatchBound !== "1") {
    soldProductsList.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("[data-dispatch-sale]");
      if (!(button instanceof HTMLButtonElement)) return;
      const orderId = String(button.dataset.dispatchSale ?? "").trim();
      const productId = String(button.dataset.dispatchProduct ?? "").trim();
      const nextStatus = String(button.dataset.nextFulfillmentStatus ?? "").trim();
      if (!orderId || !productId) return;
      if (button.disabled) return;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      const result = await markSaleDispatchOnServer({ orderId, productId, status: nextStatus });
      button.removeAttribute("aria-busy");
      if (!result.ok) {
        button.disabled = false;
        if (soldProductsStatus) soldProductsStatus.textContent = result.error;
        return;
      }
      if (soldProductsStatus) soldProductsStatus.textContent = "";
      invalidateSalesSummaryCache();
      lastSoldProductsSignature = "";
      await loadSoldProducts();
    });
    soldProductsList.dataset.dispatchBound = "1";
  }

  if (!soldProductsResizeBound) {
    window.addEventListener("resize", scheduleSoldProductsScrollWindow);
    soldProductsResizeBound = true;
  }

  if (soldProductsDispatchFilter instanceof HTMLInputElement && !soldProductsFilterBound) {
    soldProductsDispatchFilter.addEventListener("change", () => {
      applySoldProductsDispatchFilter();
    });
    soldProductsFilterBound = true;
  }

  if (deleteModalCancel && deleteModalCancel.dataset.abMySalesModalBound !== "true") {
    deleteModalCancel.addEventListener("click", closeDeleteModal);
    deleteModalCancel.dataset.abMySalesModalBound = "true";
  }

  if (deleteModalClose && deleteModalClose.dataset.abMySalesModalBound !== "true") {
    deleteModalClose.addEventListener("click", closeDeleteModal);
    deleteModalClose.dataset.abMySalesModalBound = "true";
  }

  if (deleteModalConfirm && deleteModalConfirm.dataset.abMySalesModalBound !== "true") {
    deleteModalConfirm.addEventListener("click", async () => {
      const productId = pendingDeleteProductId;
      if (!productId) return;
      if (deleteModalConfirm instanceof HTMLButtonElement) {
        deleteModalConfirm.disabled = true;
        deleteModalConfirm.setAttribute("aria-busy", "true");
      }
      await deletePublishedProduct(productId, pendingDeleteTrigger);
      if (deleteModalConfirm instanceof HTMLButtonElement) {
        deleteModalConfirm.disabled = false;
        deleteModalConfirm.removeAttribute("aria-busy");
      }
      closeDeleteModal();
    });
    deleteModalConfirm.dataset.abMySalesModalBound = "true";
  }

  if (!modalKeyDownBound) {
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (deleteModal?.classList.contains("ab-is-hidden")) return;
      closeDeleteModal();
    });
    modalKeyDownBound = true;
  }
};
let pendingDeleteProductId = "";
let pendingDeleteTrigger = null;
let salesLoadInFlight = false;
let lastSalesLoadAt = 0;
let lastSoldProductsSignature = "";
let lastPublishedProductsSignature = "";
let salesRealtimeChannel = null;
let salesRealtimeRefreshTimer = null;
let soldProductsResizeBound = false;
let soldProductsFilterBound = false;
let lastSoldProductsItems = [];
let soldProductCards = [];

const LAST_SEEN_SALE_KEY = "ab_last_seen_sale_at_v1";
const SALES_BOOTSTRAP_NOTICE_KEY = "ab_sales_bootstrap_notice_v1";
const SALES_MIN_GAP_MS = 4000;
const SALES_REALTIME_REFRESH_DEBOUNCE_MS = 900;
const SOLD_PRODUCTS_VISIBLE_CARD_COUNT = 3;

/* Formateo de precios ARS. */
const formatPrice = (value) => {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("es-AR");
};

/* Formateo de fecha legible. */
const formatDate = (value) => {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

/* Formateo de métodos de entrega. */
const formatDelivery = (value) => {
  if (!Array.isArray(value) || value.length === 0) return "No especificada";
  const labels = value.map((item) => {
    if (item === "retiro") return "Retiro";
    if (item === "envio") return "Envío";
    return item;
  });
  return labels.join(" + ");
};

const formatFulfillmentStatus = (status, shippingRequested) => {
  const raw = String(status ?? "").trim();
  const labels = {
    pending: shippingRequested ? "Envío solicitado" : "Retiro pendiente",
    requested: "Envío solicitado",
    preparing: "Preparando envío",
    shipped: "Enviado",
    delivered: "Entregado",
    pickup_pending: "Retiro pendiente",
    ready_for_pickup: "Listo para retirar",
    completed: "Completado",
  };
  return labels[raw] ?? labels.pending;
};

const getNextFulfillmentAction = (status, shippingRequested) => {
  const raw = String(status ?? "").trim();
  if (shippingRequested) {
    if (!raw || raw === "pending" || raw === "requested") {
      return { status: "preparing", label: "Preparar envío" };
    }
    if (raw === "preparing") return { status: "shipped", label: "Marcar enviado" };
    if (raw === "shipped") return { status: "delivered", label: "Marcar entregado" };
    return null;
  }
  if (!raw || raw === "pending" || raw === "pickup_pending") {
    return { status: "ready_for_pickup", label: "Listo para retirar" };
  }
  if (raw === "ready_for_pickup") return { status: "completed", label: "Completar retiro" };
  return null;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getLastSeenSaleStorageKey = () => `${LAST_SEEN_SALE_KEY}:${currentUserId || "anonymous"}`;
const getBootstrapNoticeStorageKey = () => `${SALES_BOOTSTRAP_NOTICE_KEY}:${currentUserId || "anonymous"}`;

const getLatestSaleCursor = (items) => {
  if (!Array.isArray(items) || items.length === 0) return { cursor: "", latestSale: null };
  let latestSale = null;
  let latestSaleTime = 0;

  items.forEach((item) => {
    const soldAt = String(item?.lastSoldAt ?? "").trim();
    if (!soldAt) return;
    const soldAtTime = new Date(soldAt).getTime();
    if (Number.isNaN(soldAtTime)) return;
    if (!latestSale || soldAtTime > latestSaleTime) {
      latestSale = item;
      latestSaleTime = soldAtTime;
    }
  });

  if (!latestSale) return { cursor: "", latestSale: null };
  return {
    cursor: `${String(latestSale.lastSoldAt ?? "").trim()}_${String(latestSale.lastOrderId ?? "").trim()}`,
    latestSale,
  };
};

const showUrgentSaleModal = ({ title, message }) => {
  const lastTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const modal = document.createElement("div");
  modal.className = "ab-orders-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <div class="ab-orders-modal__backdrop"></div>
    <div class="ab-orders-modal__panel" role="document">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <div class="ab-orders-modal__actions">
        <button type="button" class="ab-orders-delete-btn">Entendido</button>
      </div>
    </div>
  `;

  const close = () => {
    if (modal.contains(document.activeElement)) {
      if (lastTrigger instanceof HTMLElement && document.contains(lastTrigger)) {
        lastTrigger.focus();
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
    modal.remove();
  };

  modal.querySelector(".ab-orders-modal__backdrop")?.addEventListener("click", close);
  modal.querySelector(".ab-orders-delete-btn")?.addEventListener("click", close);
  document.body.appendChild(modal);
};

const notifyIfNewSale = (soldItems) => {
  if (!currentUserId || !Array.isArray(soldItems) || soldItems.length === 0) return;

  const { latestSale } = getLatestSaleCursor(soldItems);
  if (!latestSale) return;
  const latestSaleIso = String(latestSale.lastSoldAt ?? "").trim();
  const latestOrderId = String(latestSale.lastOrderId ?? "").trim();
  const latestCursor = `${latestSaleIso}|${latestOrderId}`;

  const storageKey = getLastSeenSaleStorageKey();
  const previousCursor = window.localStorage.getItem(storageKey);

  /* Primera carga: registra baseline y muestra un aviso inicial si hay ventas. */
  if (!previousCursor) {
    window.localStorage.setItem(storageKey, latestCursor);
    const bootstrapKey = getBootstrapNoticeStorageKey();
    if (!window.localStorage.getItem(bootstrapKey)) {
      showUrgentSaleModal({
        title: "Monitoreo de ventas activo",
        message: "Se detectaron ventas en tu cuenta. Te vamos a avisar cuando entre una compra nueva.",
      });
      window.localStorage.setItem(bootstrapKey, "1");
    }
    return;
  }

  if (latestCursor === previousCursor) return;
  window.localStorage.setItem(storageKey, latestCursor);

  showUrgentSaleModal({
    title: "Nueva compra recibida",
    message: "Recibiste una venta. Revisá la sección de productos vendidos.",
  });
};

const isSalesPageActive = () => {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/mis-ventas";
};

const scheduleRealtimeRefresh = () => {
  if (!isSalesPageActive()) return;
  if (salesRealtimeRefreshTimer) {
    window.clearTimeout(salesRealtimeRefreshTimer);
  }
  salesRealtimeRefreshTimer = window.setTimeout(() => {
    salesRealtimeRefreshTimer = null;
    loadMyProducts();
  }, SALES_REALTIME_REFRESH_DEBOUNCE_MS);
};

const teardownSalesRealtime = async () => {
  if (salesRealtimeRefreshTimer) {
    window.clearTimeout(salesRealtimeRefreshTimer);
    salesRealtimeRefreshTimer = null;
  }
  if (!salesRealtimeChannel) return;
  const channel = salesRealtimeChannel;
  salesRealtimeChannel = null;
  try {
    await supabase.removeChannel(channel);
  } catch {
    /* noop */
  }
};

const setupSalesRealtime = async () => {
  if (!isSalesPageActive() || !currentUserId) return;
  if (salesRealtimeChannel) return;

  const channelName = `ab-my-sales-${currentUserId}`;
  salesRealtimeChannel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "products", filter: `user_id=eq.${currentUserId}` },
      scheduleRealtimeRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "order_items" },
      scheduleRealtimeRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      scheduleRealtimeRefresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sale_dispatches", filter: `seller_id=eq.${currentUserId}` },
      scheduleRealtimeRefresh,
    )
    .subscribe();
};

const buildPublishedProductsSignature = (products) => {
  if (!Array.isArray(products) || products.length === 0) return "empty";
  return products
    .map((product) =>
      [
        product?.id ?? "",
        product?.title ?? "",
        product?.price ?? 0,
        product?.currency ?? "",
        product?.image_url ?? "",
        product?.location ?? "",
        product?.pickup_address ?? "",
        Array.isArray(product?.delivery_methods) ? product.delivery_methods.join(",") : "",
        product?.created_at ?? "",
      ].join("|"),
    )
    .join("::");
};

const buildSoldProductsSignature = (products) => {
  const { cursor } = getLatestSaleCursor(products);
  if (!Array.isArray(products) || products.length === 0) return "empty";
  const dispatchState = products
    .map((product) => {
      const history = Array.isArray(product?.salesHistory) ? product.salesHistory : [];
      if (history.length === 0) {
        return [
          product?.productId ?? "",
          product?.lastOrderId ?? "",
          product?.lastSoldAt ?? "",
          product?.lastBuyerUserId ?? "",
        ].join("|");
      }
      return history
        .map((sale) =>
          [
            sale?.productId ?? product?.productId ?? "",
            sale?.orderId ?? "",
            sale?.soldAt ?? "",
            sale?.shippingRequested ? "shipping" : "pickup",
            sale?.fulfillmentStatus ?? "",
            sale?.dispatchedAt ?? "",
          ].join("|"),
        )
        .join(";");
    })
    .join("::");
  return `${cursor || "empty"}::${dispatchState}`;
};

const updateSoldProductsScrollWindow = () => {
  if (!soldProductsList) return;
  const cards = Array.from(soldProductsList.querySelectorAll(".ab-provider-product-card"));
  if (cards.length <= SOLD_PRODUCTS_VISIBLE_CARD_COUNT) {
    soldProductsList.classList.remove("ab-sold-products-scroll");
    soldProductsList.style.removeProperty("--ab-sold-products-scroll-height");
    return;
  }

  const lastVisibleCard = cards[SOLD_PRODUCTS_VISIBLE_CARD_COUNT - 1];
  const listRect = soldProductsList.getBoundingClientRect();
  const cardRect = lastVisibleCard.getBoundingClientRect();
  const visibleHeight = Math.max(0, cardRect.bottom - listRect.top + 8);
  soldProductsList.style.setProperty("--ab-sold-products-scroll-height", `${Math.ceil(visibleHeight)}px`);
  soldProductsList.classList.add("ab-sold-products-scroll");
};

const scheduleSoldProductsScrollWindow = () => {
  window.requestAnimationFrame(updateSoldProductsScrollWindow);
};

const applySoldProductsDispatchFilter = () => {
  if (!soldProductsList || !soldProductsEmpty) return;
  const showDispatchOnly = soldProductsDispatchFilter instanceof HTMLInputElement && soldProductsDispatchFilter.checked;
  const emptyText = soldProductsEmpty.querySelector("p");
  const visibleCards = showDispatchOnly
    ? soldProductCards.filter((card) => card.dataset.salePendingDispatch === "true")
    : soldProductCards;

  soldProductsList.replaceChildren(...visibleCards);
  soldProductsList.scrollTop = 0;

  if (visibleCards.length === 0) {
    soldProductsList.classList.remove("ab-sold-products-scroll");
    soldProductsList.style.removeProperty("--ab-sold-products-scroll-height");
    if (emptyText) {
      emptyText.textContent = showDispatchOnly
        ? "No tenés productos pendientes de despacho."
        : "Todavía no tenés productos vendidos.";
    }
    soldProductsEmpty.classList.remove("ab-is-hidden");
    return;
  }

  soldProductsEmpty.classList.add("ab-is-hidden");
  scheduleSoldProductsScrollWindow();
};

/* Renderiza resumen de productos vendidos. */
const renderSoldProducts = (products) => {
  if (!soldProductsList || !soldProductsEmpty) return;
  soldProductsList.innerHTML = "";
  soldProductCards = [];
  const emptyText = soldProductsEmpty.querySelector("p");
  if (!Array.isArray(products) || products.length === 0) {
    soldProductsList.classList.remove("ab-sold-products-scroll");
    soldProductsList.style.removeProperty("--ab-sold-products-scroll-height");
    if (emptyText) emptyText.textContent = "Todavía no tenés productos vendidos.";
    soldProductsEmpty.classList.remove("ab-is-hidden");
    return;
  }

  soldProductsList.classList.add("ab-provider-products-grid");

  const salesCards = [];
  products.forEach((product) => {
    const history = Array.isArray(product.salesHistory) ? product.salesHistory : [];
    const safeTitle = escapeHtml(product.title || "Producto sin título");
    const safeCurrency = escapeHtml(product.currency || "ARS");
    const safeImage = escapeHtml(String(product.image || "").trim() || "/logo2.svg");

    if (history.length === 0) {
      salesCards.push({
        title: safeTitle,
        currency: safeCurrency,
        image: safeImage,
        soldAt: product.lastSoldAt,
        orderId: product.lastOrderId || "",
        productId: product.productId || "",
        qty: product.quantity ?? 0,
        subtotal: product.revenue ?? 0,
        buyerName: product.lastBuyerName || "",
        buyerUserId: product.lastBuyerUserId || "",
        buyerNote: product.lastBuyerNote || "",
        shippingRequested: Boolean(product.shippingRequested),
        shippingAddress: product.shippingAddress || "",
        shippingCity: product.shippingCity || "",
        shippingPhone: product.shippingPhone || "",
        shippingCost: product.shippingCost ?? 0,
        fulfillmentStatus: product.fulfillmentStatus || (product.shippingRequested ? "requested" : "pickup_pending"),
        dispatchedAt: null,
      });
      return;
    }

    history.forEach((sale) => {
      salesCards.push({
        title: safeTitle,
        currency: safeCurrency,
        image: safeImage,
        soldAt: sale?.soldAt ?? null,
        orderId: sale?.orderId ?? "",
        productId: sale?.productId ?? product.productId ?? "",
        qty: sale?.qty ?? 1,
        subtotal: sale?.subtotal ?? 0,
        buyerName: sale?.buyerName ?? "",
        buyerUserId: sale?.buyerUserId ?? "",
        buyerNote: sale?.buyerNote ?? "",
        shippingRequested: Boolean(sale?.shippingRequested),
        shippingAddress: sale?.shippingAddress ?? "",
        shippingCity: sale?.shippingCity ?? "",
        shippingPhone: sale?.shippingPhone ?? "",
        shippingCost: sale?.shippingCost ?? 0,
        fulfillmentStatus: sale?.fulfillmentStatus ?? (sale?.shippingRequested ? "requested" : "pickup_pending"),
        dispatchedAt: sale?.dispatchedAt ?? null,
      });
    });
  });

  if (salesCards.length === 0) {
    soldProductsList.classList.remove("ab-sold-products-scroll");
    soldProductsList.style.removeProperty("--ab-sold-products-scroll-height");
    if (emptyText) emptyText.textContent = "Todavía no tenés productos vendidos.";
    soldProductsEmpty.classList.remove("ab-is-hidden");
    return;
  }

  soldProductsEmpty.classList.add("ab-is-hidden");

  salesCards
    .sort((a, b) => new Date(b.soldAt ?? 0).getTime() - new Date(a.soldAt ?? 0).getTime())
    .forEach((sale, index) => {
      const card = document.createElement("article");
      const saleOrderId = String(sale.orderId || "").trim();
      const saleProductId = String(sale.productId || "").trim();
      const shippingRequested = Boolean(sale.shippingRequested);
      const fulfillmentStatus = String(sale.fulfillmentStatus || (shippingRequested ? "requested" : "pickup_pending")).trim();
      const nextAction = getNextFulfillmentAction(fulfillmentStatus, shippingRequested);
      const isCompleted = !nextAction;
      const isLatestSale = index === 0;
      const isPendingDispatch = Boolean(saleOrderId) && !isCompleted;
      card.className = `ab-provider-product-card ${isPendingDispatch ? "ab-sale-card--pending" : ""}`.trim();
      card.dataset.salePendingDispatch = isPendingDispatch ? "true" : "false";
      const safeBuyerName = escapeHtml(sale.buyerName || "");
      const safeBuyerUserId = encodeURIComponent(String(sale.buyerUserId || "").trim());
      const safeNote = escapeHtml(sale.buyerNote || "");
      const safeOrderId = escapeHtml(saleOrderId.slice(0, 8));
      const safeShippingAddress = escapeHtml([sale.shippingAddress, sale.shippingCity].filter(Boolean).join(", "));
      const safeShippingPhone = escapeHtml(sale.shippingPhone || "");
      const statusBadge = isPendingDispatch
        ? isLatestSale
          ? `Nueva venta · ${formatFulfillmentStatus(fulfillmentStatus, shippingRequested)}`
          : formatFulfillmentStatus(fulfillmentStatus, shippingRequested)
        : formatFulfillmentStatus(fulfillmentStatus, shippingRequested);

      card.innerHTML = `
        <img
          class="ab-provider-product-card__image"
          src="${sale.image}"
          alt="${sale.title}"
          loading="lazy"
        />
        <div class="ab-provider-product-card__meta">
          <div>
            <p class="ab-provider-product-card__label">${statusBadge}</p>
            <p class="ab-provider-product-card__code">Orden ${safeOrderId || "N/A"}</p>
          </div>
          <p class="ab-provider-product-card__price">
            $${formatPrice(sale.subtotal)} <span>${sale.currency}</span>
          </p>
        </div>
        <h2>${sale.title}</h2>
        <p class="ab-provider-product-card__description">Fecha: ${formatDate(sale.soldAt)}</p>
        <ul class="ab-provider-product-card__details">
          <li>Cantidad: <strong>${sale.qty}</strong></li>
          ${
            safeBuyerName
              ? `<li>Cliente: <strong>${
                  safeBuyerUserId
                    ? `<a class="ab-order-card__provider-link" href="/proveedor-publico/${safeBuyerUserId}">${safeBuyerName}</a>`
                    : safeBuyerName
                }</strong></li>`
              : ""
          }
          ${safeNote ? `<li>Nota: <strong>${safeNote}</strong></li>` : ""}
          ${
            shippingRequested
              ? `<li>Entrega: <strong>${formatFulfillmentStatus(fulfillmentStatus, true)}</strong></li>
                 <li>Costo envío: <strong>$${formatPrice(sale.shippingCost ?? 0)}</strong></li>
                 <li>Dirección: <strong>${safeShippingAddress || "Sin dirección"}</strong></li>
                 ${safeShippingPhone ? `<li>Teléfono: <strong>${safeShippingPhone}</strong></li>` : ""}`
              : `<li>Entrega: <strong>${formatFulfillmentStatus(fulfillmentStatus, false)}</strong></li>`
          }
        </ul>
        <div class="ab-provider-product-card__actions">
          <button
            type="button"
            class="ab-provider-product-card__button ${isPendingDispatch ? "ab-provider-product-card__button--buy" : "ab-provider-product-card__button--ghost"}"
            data-dispatch-sale="${escapeHtml(saleOrderId)}"
            data-dispatch-product="${escapeHtml(saleProductId)}"
            data-next-fulfillment-status="${escapeHtml(nextAction?.status ?? "")}"
            ${!saleOrderId || !saleProductId || !nextAction ? "disabled aria-disabled=\"true\"" : ""}
          >
            ${nextAction?.label ?? formatFulfillmentStatus(fulfillmentStatus, shippingRequested)}
          </button>
        </div>
      `;
      soldProductCards.push(card);
    });

  applySoldProductsDispatchFilter();
};

/* Renderiza tarjetas de productos del usuario. */
const renderMyProducts = (products) => {
  if (!productsGrid || !productsEmpty) return;
  productsGrid.innerHTML = "";
  if (!Array.isArray(products) || products.length === 0) {
    productsEmpty.classList.remove("ab-is-hidden");
    return;
  }
  productsEmpty.classList.add("ab-is-hidden");
  products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "ab-provider-product-card";
    const shortId = (product.id || "").toString().replace(/-/g, "").slice(0, 6).toUpperCase() || "N/A";
    const safeImageUrl = escapeHtml(product.image_url || "/logo2.svg");
    const safeTitle = escapeHtml(product.title || "Sin título");
    const safeDescription = escapeHtml(product.description || "Sin descripción");
    const safeCurrency = escapeHtml(product.currency || "ARS");
    const safeLocation = escapeHtml(product.location || "Sin especificar");
    const safePickupAddress = escapeHtml(product.pickup_address || "");
    card.innerHTML = `
      <img
        class="ab-provider-product-card__image"
        src="${safeImageUrl}"
        alt="${safeTitle}"
        loading="lazy"
      />
      <div class="ab-provider-product-card__meta">
        <div>
          <p class="ab-provider-product-card__label">Producto</p>
          <p class="ab-provider-product-card__code">ID ${shortId}</p>
        </div>
        <p class="ab-provider-product-card__price">
          $${formatPrice(product.price)} <span>${safeCurrency}</span>
        </p>
      </div>
      <h2>${safeTitle}</h2>
      <p class="ab-provider-product-card__description">
        ${safeDescription}
      </p>
      <ul class="ab-provider-product-card__details">
        <li>Fecha: <strong>${formatDate(product.created_at)}</strong></li>
        <li>Ubicación: <strong>${safeLocation}</strong></li>
        ${safePickupAddress ? `<li>Dirección: <strong>${safePickupAddress}</strong></li>` : ""}
        <li>Entrega: <strong>${formatDelivery(product.delivery_methods)}</strong></li>
      </ul>
      <div class="ab-provider-product-card__actions">
        <button
          type="button"
          class="ab-provider-product-card__button ab-provider-product-card__button--ghost"
          data-delete-product="${escapeHtml(product.id)}"
        >
          Borrar
        </button>
      </div>
    `;
    productsGrid.appendChild(card);
  });
};

const deletePublishedProduct = async (productId, triggerButton) => {
  if (!productId || !currentUserId) return;
  if (triggerButton instanceof HTMLButtonElement) {
    triggerButton.disabled = true;
    triggerButton.setAttribute("aria-busy", "true");
  }

  try {
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId)
      .eq("user_id", currentUserId);

    if (error) {
      return;
    }

    await loadMyProducts();
  } finally {
    if (triggerButton instanceof HTMLButtonElement) {
      triggerButton.disabled = false;
      triggerButton.removeAttribute("aria-busy");
    }
  }
};

const openDeleteModal = (productId, triggerButton) => {
  if (!deleteModal || !productId) return;
  pendingDeleteProductId = productId;
  pendingDeleteTrigger = triggerButton ?? null;
  deleteModal.classList.remove("ab-is-hidden");
  deleteModal.setAttribute("aria-hidden", "false");
  deleteModalConfirm?.focus();
};

const closeDeleteModal = () => {
  if (!deleteModal) return;
  if (deleteModal.contains(document.activeElement)) {
    if (pendingDeleteTrigger instanceof HTMLElement) {
      pendingDeleteTrigger.focus();
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }
  pendingDeleteProductId = "";
  pendingDeleteTrigger = null;
  deleteModal.classList.add("ab-is-hidden");
  deleteModal.setAttribute("aria-hidden", "true");
};

/* Trae el resumen de productos vendidos desde backend autenticado. */
const fetchSoldProductsSummary = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { items: [], error: "" };

  return fetchSalesSummary(token, { force: true });
};

const markSaleDispatchOnServer = async ({ orderId, productId, status }) => {
  const safeOrderId = String(orderId ?? "").trim();
  const safeProductId = String(productId ?? "").trim();
  const safeStatus = String(status ?? "").trim();
  if (!safeOrderId || !safeProductId) {
    return { ok: false, error: "Faltan datos de venta para actualizar la entrega." };
  }
  if (!safeStatus) {
    return { ok: false, error: "Falta el estado de entrega." };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { ok: false, error: "Sesion expirada." };

  const response = await fetch("/api/sales-dispatch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId: safeOrderId, productId: safeProductId, status: safeStatus }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: String(payload?.error ?? "No se pudo guardar el estado de entrega.") };
  }
  return { ok: true, error: "" };
};

/* Carga y resume ventas de productos del usuario autenticado. */
const loadSoldProducts = async () => {
  if (!soldProductsList || !soldProductsEmpty || !soldProductsStatus) return;
  soldProductsStatus.textContent = "Cargando productos vendidos...";

  if (!currentUserId) {
    soldProductsStatus.textContent = "";
    renderSoldProducts([]);
    lastSoldProductsSignature = "empty";
    lastSoldProductsItems = [];
    return;
  }

  try {
    const { items, error } = await fetchSoldProductsSummary();
    if (error) {
      soldProductsStatus.textContent = error;
      renderSoldProducts([]);
      return;
    }

    const nextSoldSignature = buildSoldProductsSignature(items);
    soldProductsStatus.textContent = "";
    lastSoldProductsItems = items;
    if (nextSoldSignature !== lastSoldProductsSignature) {
      renderSoldProducts(items);
      lastSoldProductsSignature = nextSoldSignature;
    }
    notifyIfNewSale(items);
  } catch {
    soldProductsStatus.textContent = "";
    renderSoldProducts([]);
  }
};

/* Carga productos del usuario autenticado. */
const loadMyProducts = async () => {
  if (!productsGrid || !productsEmpty) return;
  if (!isSalesPageActive()) return;
  const now = Date.now();
  if (salesLoadInFlight) return;
  if (now - lastSalesLoadAt < SALES_MIN_GAP_MS) return;
  salesLoadInFlight = true;
  lastSalesLoadAt = now;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session?.user) {
      await teardownSalesRealtime();
      currentUserId = "";
      productsEmpty.classList.remove("ab-is-hidden");
      renderSoldProducts([]);
      if (soldProductsStatus) soldProductsStatus.textContent = "";
      lastPublishedProductsSignature = "empty";
      lastSoldProductsSignature = "empty";
      lastSoldProductsItems = [];
      return;
    }
    const nextUserId = session.user.id;
    if (currentUserId && currentUserId !== nextUserId) {
      await teardownSalesRealtime();
      lastPublishedProductsSignature = "";
      lastSoldProductsSignature = "";
    }
    currentUserId = nextUserId;
    const { data, error } = await supabase
      .from("products")
      .select("id,title,description,price,currency,image_url,location,delivery_methods,pickup_address,created_at")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });
    if (error) {
      productsEmpty.classList.remove("ab-is-hidden");
      await loadSoldProducts();
      return;
    }
    const safeProducts = data ?? [];
    const nextPublishedSignature = buildPublishedProductsSignature(safeProducts);
    if (nextPublishedSignature !== lastPublishedProductsSignature) {
      renderMyProducts(safeProducts);
      lastPublishedProductsSignature = nextPublishedSignature;
    }
    await loadSoldProducts();
    await setupSalesRealtime();
  } catch {
    productsEmpty.classList.remove("ab-is-hidden");
    renderSoldProducts([]);
    if (soldProductsStatus) soldProductsStatus.textContent = "";
  } finally {
    salesLoadInFlight = false;
  }
};

/* Inicialización y hooks de navegación. */
const initMySalesProducts = () => {
  refreshMySalesNodes();
  bindMySalesEvents();

  if (!isSalesPageActive()) {
    void teardownSalesRealtime();
    return;
  }

  loadMyProducts();
};

initMySalesProducts();
document.addEventListener("astro:page-load", initMySalesProducts);
document.addEventListener("astro:after-swap", initMySalesProducts);
window.addEventListener("pageshow", initMySalesProducts);
window.addEventListener("pagehide", teardownSalesRealtime);
