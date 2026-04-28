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
    card.innerHTML = `
      <img
        class="ab-provider-product-card__image"
        src="${product.image_url || "/logo2.svg"}"
        alt="${product.title || "Producto"}"
        loading="lazy"
      />
      <div class="ab-provider-product-card__meta">
        <div>
          <p class="ab-provider-product-card__label">Producto</p>
          <p class="ab-provider-product-card__code">ID ${shortId}</p>
        </div>
        <p class="ab-provider-product-card__price">
          $${formatPrice(product.price)} <span>${product.currency || "ARS"}</span>
        </p>
      </div>
      <h2>${product.title || "Sin título"}</h2>
      <p class="ab-provider-product-card__description">
        ${product.description || "Sin descripción"}
      </p>
      <ul class="ab-provider-product-card__details">
        <li>Publicada el <strong>${formatDate(product.created_at)}</strong></li>
        <li>Ubicación: <strong>${product.location || "Sin especificar"}</strong></li>
        ${product.pickup_address ? `<li>Dirección: <strong>${product.pickup_address}</strong></li>` : ""}
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
    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("id, created_at, order_items (product_id, name, qty, unit_price)")
      .order("created_at", { ascending: false });

    if (ordersError) {
      soldProductsStatus.textContent = "";
      renderSoldProducts([]);
      return;
    }

    const orderItems = (ordersData ?? [])
      .flatMap((order) =>
        (Array.isArray(order?.order_items) ? order.order_items : []).map((item) => ({
          ...item,
          order_id: order?.id ?? null,
          created_at: order?.created_at ?? null,
        }))
      )
      .filter((item) => String(item?.product_id ?? "").trim());

    if (orderItems.length === 0) {
      soldProductsStatus.textContent = "";
      renderSoldProducts([]);
      return;
    }

    const uniqueProductIds = [...new Set(orderItems.map((item) => String(item.product_id).trim()))];
    const { data: ownProducts, error: productsError } = await supabase
      .from("products")
      .select("id, title, currency, user_id")
      .in("id", uniqueProductIds)
      .eq("user_id", currentUserId);

    if (productsError) {
      soldProductsStatus.textContent = "";
      renderSoldProducts([]);
      return;
    }

    const ownMap = new Map((ownProducts ?? []).map((product) => [String(product.id), product]));
    if (ownMap.size === 0) {
      soldProductsStatus.textContent = "";
      renderSoldProducts([]);
      return;
    }

    const soldMap = new Map();
    orderItems.forEach((item) => {
      const productId = String(item.product_id).trim();
      const ownProduct = ownMap.get(productId);
      if (!ownProduct) return;

      const qty = Number(item.qty ?? 1);
      const unitPrice = Number(item.unit_price ?? 0);
      const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
      const safePrice = Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0;
      const createdAt = item.created_at ? new Date(item.created_at) : null;
      const entry = soldMap.get(productId) ?? {
        productId,
        title: ownProduct.title || item.name || "Producto",
        currency: ownProduct.currency || "ARS",
        quantity: 0,
        revenue: 0,
        ordersSet: new Set(),
        lastSoldAt: null,
      };

      entry.quantity += safeQty;
      entry.revenue += safePrice * safeQty;
      if (item.order_id) entry.ordersSet.add(String(item.order_id));
      if (createdAt && !Number.isNaN(createdAt.getTime())) {
        if (!entry.lastSoldAt || createdAt > entry.lastSoldAt) {
          entry.lastSoldAt = createdAt;
        }
      }
      soldMap.set(productId, entry);
    });

    const soldProducts = Array.from(soldMap.values())
      .map((entry) => ({
        productId: entry.productId,
        title: entry.title,
        currency: entry.currency,
        quantity: entry.quantity,
        revenue: entry.revenue,
        ordersCount: entry.ordersSet.size,
        lastSoldAt: entry.lastSoldAt ? entry.lastSoldAt.toISOString() : null,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    soldProductsStatus.textContent = "";
    renderSoldProducts(soldProducts);
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
