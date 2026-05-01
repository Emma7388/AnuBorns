/* Mis ventas: render de productos publicados por el usuario. */
import { supabase } from "../lib/supabaseClient";

/* Referencias DOM. */
const soldProductsList = document.getElementById("my-sold-products-list");
const soldProductsEmpty = document.getElementById("my-sold-products-empty");
const soldProductsStatus = document.getElementById("my-sold-products-status");
const productsGrid = document.getElementById("my-products-grid");
const productsEmpty = document.getElementById("my-products-empty");
const deleteModal = document.getElementById("sales-delete-modal");
const deleteModalClose = document.querySelector("[data-sales-modal-close]");
const deleteModalCancel = document.querySelector("[data-sales-modal-cancel]");
const deleteModalConfirm = document.querySelector("[data-sales-modal-confirm]");
let currentUserId = "";
let productsEventsBound = false;
let modalEventsBound = false;
let pendingDeleteProductId = "";
let pendingDeleteTrigger = null;
let salesPollingStarted = false;
let salesLoadInFlight = false;
let lastSalesLoadAt = 0;
let lastSoldProductsSignature = "";
let lastPublishedProductsSignature = "";

const LAST_SEEN_SALE_KEY = "ab_last_seen_sale_at_v1";
const SALES_BOOTSTRAP_NOTICE_KEY = "ab_sales_bootstrap_notice_v1";
const SALES_REFRESH_INTERVAL_MS = 60000;
const SALES_MIN_GAP_MS = 4000;

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

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getLastSeenSaleStorageKey = () => `${LAST_SEEN_SALE_KEY}:${currentUserId || "anonymous"}`;
const getBootstrapNoticeStorageKey = () => `${SALES_BOOTSTRAP_NOTICE_KEY}:${currentUserId || "anonymous"}`;

const showUrgentSaleModal = ({ title, message }) => {
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
    modal.remove();
  };

  modal.querySelector(".ab-orders-modal__backdrop")?.addEventListener("click", close);
  modal.querySelector(".ab-orders-delete-btn")?.addEventListener("click", close);
  document.body.appendChild(modal);
};

const notifyIfNewSale = (soldItems) => {
  if (!currentUserId || !Array.isArray(soldItems) || soldItems.length === 0) return;

  const latestSale = soldItems
    .filter((item) => String(item?.lastSoldAt ?? "").trim())
    .sort((a, b) => new Date(b.lastSoldAt).getTime() - new Date(a.lastSoldAt).getTime())[0];

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
  if (!Array.isArray(products) || products.length === 0) return "empty";
  let latest = null;
  let latestTime = 0;
  products.forEach((item) => {
    const soldAt = String(item?.lastSoldAt ?? "").trim();
    if (!soldAt) return;
    const soldAtTime = new Date(soldAt).getTime();
    if (Number.isNaN(soldAtTime)) return;
    if (!latest || soldAtTime > latestTime) {
      latest = item;
      latestTime = soldAtTime;
    }
  });
  if (!latest) return "empty";
  return `${String(latest.lastSoldAt ?? "").trim()}_${String(latest.lastOrderId ?? "").trim()}`;
};

/* Renderiza resumen de productos vendidos. */
const renderSoldProducts = (products) => {
  if (!soldProductsList || !soldProductsEmpty) return;
  soldProductsList.innerHTML = "";
  if (!Array.isArray(products) || products.length === 0) {
    soldProductsEmpty.classList.remove("ab-is-hidden");
    return;
  }

  soldProductsEmpty.classList.add("ab-is-hidden");
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
        qty: product.quantity ?? 0,
        subtotal: product.revenue ?? 0,
        buyerName: product.lastBuyerName || "",
        buyerUserId: product.lastBuyerUserId || "",
        buyerNote: product.lastBuyerNote || "",
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
        qty: sale?.qty ?? 1,
        subtotal: sale?.subtotal ?? 0,
        buyerName: sale?.buyerName ?? "",
        buyerUserId: sale?.buyerUserId ?? "",
        buyerNote: sale?.buyerNote ?? "",
      });
    });
  });

  salesCards
    .sort((a, b) => new Date(b.soldAt ?? 0).getTime() - new Date(a.soldAt ?? 0).getTime())
    .forEach((sale) => {
      const card = document.createElement("article");
      card.className = "ab-provider-product-card";
      const safeBuyerName = escapeHtml(sale.buyerName || "");
      const safeBuyerUserId = encodeURIComponent(String(sale.buyerUserId || "").trim());
      const safeNote = escapeHtml(sale.buyerNote || "");
      const safeOrderId = escapeHtml(String(sale.orderId || "").slice(0, 8));

      card.innerHTML = `
        <img
          class="ab-provider-product-card__image"
          src="${sale.image}"
          alt="${sale.title}"
          loading="lazy"
        />
        <div class="ab-provider-product-card__meta">
          <div>
            <p class="ab-provider-product-card__label">Producto vendido</p>
            <p class="ab-provider-product-card__code">Orden ${safeOrderId || "N/A"}</p>
          </div>
          <p class="ab-provider-product-card__price">
            $${formatPrice(sale.subtotal)} <span>${sale.currency}</span>
          </p>
        </div>
        <h2>${sale.title}</h2>
        <p class="ab-provider-product-card__description">FECHA: ${formatDate(sale.soldAt)}</p>
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
        </ul>
      `;
      soldProductsList.appendChild(card);
    });
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
        <li>Publicada el <strong>${formatDate(product.created_at)}</strong></li>
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

  const response = await fetch("/api/my-sales-products", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { items: [], error: String(payload?.error ?? "No se pudieron cargar las ventas.") };
  }

  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    error: "",
  };
};

/* Carga y resume ventas de productos del usuario autenticado. */
const loadSoldProducts = async () => {
  if (!soldProductsList || !soldProductsEmpty || !soldProductsStatus) return;
  soldProductsStatus.textContent = "Cargando productos vendidos...";

  if (!currentUserId) {
    soldProductsStatus.textContent = "";
    renderSoldProducts([]);
    lastSoldProductsSignature = "empty";
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
      currentUserId = "";
      productsEmpty.classList.remove("ab-is-hidden");
      renderSoldProducts([]);
      if (soldProductsStatus) soldProductsStatus.textContent = "";
      lastPublishedProductsSignature = "empty";
      lastSoldProductsSignature = "empty";
      return;
    }
    currentUserId = session.user.id;
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
  if (productsGrid && !productsEventsBound) {
    productsGrid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("[data-delete-product]");
      if (!(button instanceof HTMLButtonElement)) return;
      const productId = button.dataset.deleteProduct ?? "";
      if (!productId) return;
      openDeleteModal(productId, button);
    });
    productsEventsBound = true;
  }

  if (!modalEventsBound) {
    deleteModalCancel?.addEventListener("click", closeDeleteModal);
    deleteModalClose?.addEventListener("click", closeDeleteModal);
    deleteModalConfirm?.addEventListener("click", async () => {
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
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (deleteModal?.classList.contains("ab-is-hidden")) return;
      closeDeleteModal();
    });
    modalEventsBound = true;
  }

  loadMyProducts();
  if (!salesPollingStarted) {
    window.setInterval(() => {
      if (!isSalesPageActive()) return;
      if (document.visibilityState === "hidden") return;
      loadMyProducts();
    }, SALES_REFRESH_INTERVAL_MS);
    salesPollingStarted = true;
  }
};

initMySalesProducts();
document.addEventListener("astro:page-load", initMySalesProducts);
document.addEventListener("astro:after-swap", initMySalesProducts);
window.addEventListener("pageshow", initMySalesProducts);
