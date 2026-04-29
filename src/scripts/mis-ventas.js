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

/* Renderiza resumen de productos vendidos. */
const renderSoldProducts = (products) => {
  if (!soldProductsList || !soldProductsEmpty) return;
  soldProductsList.innerHTML = "";
  if (!Array.isArray(products) || products.length === 0) {
    soldProductsEmpty.classList.remove("ab-is-hidden");
    return;
  }

  soldProductsEmpty.classList.add("ab-is-hidden");
  products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "ab-order-card";
    card.innerHTML = `
      <div class="ab-order-card__header">
        <div>
          <p class="ab-order-card__label">Producto vendido</p>
          <p class="ab-order-card__date">Última venta: ${formatDate(product.lastSoldAt)}</p>
        </div>
        <strong>$${formatPrice(product.revenue)} ${escapeHtml(product.currency || "ARS")}</strong>
      </div>
      <ul class="ab-order-card__items">
        <li>
          <div>
            <strong>${escapeHtml(product.title || "Producto sin título")}</strong>
            <p>Órdenes: ${product.ordersCount}</p>
            ${
              product.lastBuyerNote
                ? `<p>Nota: ${escapeHtml(product.lastBuyerNote)}</p>`
                : ""
            }
          </div>
          <span>Unidades: ${product.quantity}</span>
        </li>
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
    return;
  }

  try {
    const { items, error } = await fetchSoldProductsSummary();
    if (error) {
      soldProductsStatus.textContent = error;
      renderSoldProducts([]);
      return;
    }
    soldProductsStatus.textContent = "";
    renderSoldProducts(items);
  } catch {
    soldProductsStatus.textContent = "";
    renderSoldProducts([]);
  }
};

/* Carga productos del usuario autenticado. */
const loadMyProducts = async () => {
  if (!productsGrid || !productsEmpty) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session?.user) {
      currentUserId = "";
      productsEmpty.classList.remove("ab-is-hidden");
      renderSoldProducts([]);
      if (soldProductsStatus) soldProductsStatus.textContent = "";
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
    renderMyProducts(data ?? []);
    await loadSoldProducts();
  } catch {
    productsEmpty.classList.remove("ab-is-hidden");
    renderSoldProducts([]);
    if (soldProductsStatus) soldProductsStatus.textContent = "";
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
};

initMySalesProducts();
document.addEventListener("astro:page-load", initMySalesProducts);
document.addEventListener("astro:after-swap", initMySalesProducts);
window.addEventListener("pageshow", initMySalesProducts);
