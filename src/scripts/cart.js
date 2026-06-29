/* Interfaz del carrito: render, acciones y navegación. */
import { supabase } from "../lib/supabaseClient";
import { getCart, removeFromCart } from "../lib/cart";
import { fetchUserProfile } from "../lib/userProfile";
import {
  SHIPPING_FEE,
  clearUnavailableProviderShippingPreferences,
  clearShippingPreference,
  getProviderShippingPreference,
  itemSupportsShipping,
  setProviderShippingPreference,
} from "../lib/shippingPreference";

let pendingRemoveProductId = "";
let lastRemoveModalTrigger = null;
let profileAddressLoaded = false;
let profileShippingAddress = "";
let profileShippingCity = "";

const getCartDom = () => ({
  itemsWrap: document.getElementById("cart-items"),
  emptyState: document.getElementById("cart-empty"),
  totalLabel: document.getElementById("cart-total"),
  clearButton: document.getElementById("cart-clear"),
  checkoutButton: document.getElementById("cart-checkout"),
  feedback: document.getElementById("cart-feedback"),
  removeModal: document.getElementById("cart-remove-modal"),
  removeModalClose: document.querySelector("[data-cart-modal-close]"),
  removeModalCancel: document.querySelector("[data-cart-modal-cancel]"),
  removeModalConfirm: document.querySelector("[data-cart-modal-confirm]"),
});

/* Escapa texto para evitar inyección HTML en templates del carrito. */
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/* Formatea precios para ARS. */
const formatPrice = (value) => {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("es-AR");
};

const getProviderKey = (item) => {
  const product = item.product ?? null;
  const providerId = String(product?.user_id ?? "").trim();
  if (providerId) return `id:${providerId}`;
  const providerName = String(product?.seller_name ?? "N/A").trim();
  return `name:${providerName.toLowerCase() || "n/a"}`;
};

const groupItemsByProvider = (items) => {
  const groups = new Map();
  items.forEach((item) => {
    const product = item.product ?? null;
    const provider = String(product?.seller_name ?? "N/A").trim() || "N/A";
    const key = getProviderKey(item);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        provider,
        subtotal: 0,
        items: [],
      });
    }
    const group = groups.get(key);
    const price = Number(item.price_snapshot ?? 0);
    group.subtotal += price;
    group.items.push(item);
  });
  return [...groups.values()];
};

const preloadShippingFromProfile = async () => {
  if (profileAddressLoaded) return;
  profileAddressLoaded = true;
  try {
    const { data } = await supabase.auth.getSession();
    const profile = await fetchUserProfile(data?.session?.user);
    profileShippingAddress = String(profile.address ?? "").trim();
    profileShippingCity = String(profile.city ?? "").trim();
  } catch {
    // Sin acción: la dirección de perfil es opcional para renderizar el carrito.
  }
};

const getDisplayShippingPreference = (providerKey) => {
  const preference = getProviderShippingPreference(providerKey);
  return {
    ...preference,
    address: preference.address || profileShippingAddress,
    city: preference.city || profileShippingCity,
  };
};

const persistProviderShippingForm = (section) => {
  if (!(section instanceof HTMLElement)) return;
  const providerKey = section.dataset.providerKey;
  if (!providerKey) return;
  const requestedInput = section.querySelector("[data-shipping-requested]");
  const provider = section.dataset.providerName ?? "";
  const previousPreference = getProviderShippingPreference(providerKey);
  setProviderShippingPreference(providerKey, {
    provider,
    requested: requestedInput instanceof HTMLInputElement && requestedInput.checked,
    address: profileShippingAddress || previousPreference.address,
    city: profileShippingCity || previousPreference.city,
  });
};

const openRemoveModal = (productId, dom = getCartDom()) => {
  const { removeModal, removeModalConfirm } = dom;
  if (!removeModal || !productId) return;
  lastRemoveModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  pendingRemoveProductId = productId;
  removeModal.classList.remove("ab-is-hidden");
  removeModal.setAttribute("aria-hidden", "false");
  removeModalConfirm?.focus();
};

const closeRemoveModal = (dom = getCartDom()) => {
  const { removeModal } = dom;
  if (!removeModal) return;
  if (removeModal.contains(document.activeElement)) {
    if (lastRemoveModalTrigger instanceof HTMLElement) {
      lastRemoveModalTrigger.focus();
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }
  pendingRemoveProductId = "";
  lastRemoveModalTrigger = null;
  removeModal.classList.add("ab-is-hidden");
  removeModal.setAttribute("aria-hidden", "true");
};

/* Renderiza el carrito completo en el DOM. */
const renderCart = async () => {
  const { itemsWrap, emptyState, totalLabel } = getCartDom();
  if (!itemsWrap || !emptyState || !totalLabel) return;
  const items = await getCart();
  itemsWrap.innerHTML = "";

  /* Estado vacío. */
  if (items.length === 0) {
    emptyState.style.display = "grid";
    clearShippingPreference();
    totalLabel.textContent = "$0";
    return;
  }

  emptyState.style.display = "none";
  await preloadShippingFromProfile();

  /* Lista de items y total. */
  let total = 0;
  const groups = groupItemsByProvider(items);
  clearUnavailableProviderShippingPreferences(groups.map((group) => group.key));
  groups.forEach((group) => {
    total += group.subtotal;
    const safeGroupProvider = escapeHtml(group.provider);
    const canRequestProviderShipping = group.items.every(itemSupportsShipping);
    const shippingPreference = getDisplayShippingPreference(group.key);
    const profileShippingReady = Boolean(profileShippingAddress && profileShippingCity);
    const hasProviderShipping = canRequestProviderShipping && shippingPreference.requested;
    const selectedDeliveryLabel = hasProviderShipping ? "Envío" : "A retirar";
    const shippingPrefix = hasProviderShipping ? "Envío + " : "";
    const displayedSubtotal = group.subtotal + (hasProviderShipping ? SHIPPING_FEE : 0);
    const section = document.createElement("section");
    section.className = "ab-cart-provider-group";
    section.dataset.providerKey = group.key;
    section.dataset.providerName = group.provider;
    section.innerHTML = `
      <div class="ab-cart-provider-group__header">
        <h2>${safeGroupProvider}</h2>
        <p>${shippingPrefix}${group.items.length} ${group.items.length === 1 ? "producto" : "productos"} · Subtotal: <strong>$${formatPrice(displayedSubtotal)}</strong></p>
      </div>
      <div class="ab-cart-provider-group__items"></div>
      <div class="ab-checkout-shipping ab-cart-provider-shipping">
        ${
          canRequestProviderShipping
            ? `
              <label class="ab-option ab-checkout-shipping__toggle">
                <input data-shipping-requested type="checkbox" ${shippingPreference.requested ? "checked" : ""} />
                Solicitar envío a domicilio para ${safeGroupProvider} (+$${formatPrice(SHIPPING_FEE)})
              </label>
              <p class="ab-muted-text">
                El envío se aplica solo a los productos de este proveedor y usa la dirección guardada en tu perfil.
              </p>
              ${
                profileShippingReady
                  ? ""
                  : `<p class="ab-muted-text">Completá dirección y ciudad en Mis datos para solicitar envío.</p>`
              }
            `
            : `<p class="ab-muted-text">Este proveedor tiene productos que no aceptan envío.</p>`
        }
      </div>
    `;

    const groupItemsWrap = section.querySelector(".ab-cart-provider-group__items");
    group.items.forEach((item) => {
      const price = Number(item.price_snapshot ?? 0);
      const product = item.product ?? null;
      const title = product?.title ?? item.product_id ?? "Producto";
      const image = product?.image_url ?? "/logo2.svg";
      const currency = product?.currency ?? "ARS";
      const safeTitle = escapeHtml(title);
      const safeImage = escapeHtml(image);
      const safeCurrency = escapeHtml(currency);
      const safeSelectedDelivery = escapeHtml(selectedDeliveryLabel);

      const row = document.createElement("article");
      row.className = "ab-cart-item";
      row.dataset.id = item.product_id;
      row.innerHTML = `
        <img class="ab-cart-item__image" src="${safeImage}" alt="${safeTitle}" loading="lazy" />
        <div class="ab-cart-item__info">
          <h2 class="ab-cart-item__title">${safeTitle}</h2>
          <ul class="ab-cart-item__details">
            <li>Entrega: <strong>${safeSelectedDelivery}</strong></li>
            <li>Precio: <strong>$${formatPrice(price)} ${safeCurrency}</strong></li>
          </ul>
        </div>
        <div class="ab-cart-item__actions">
          <button class="ab-cart-item__remove" type="button" data-action="remove" aria-label="Quitar producto" title="Quitar producto">
            <img src="/icons/borrar.svg" alt="" aria-hidden="true" />
          </button>
        </div>
      `;
      groupItemsWrap?.appendChild(row);
    });

    itemsWrap.appendChild(section);
    if (canRequestProviderShipping && shippingPreference.requested) total += SHIPPING_FEE;
  });

  totalLabel.textContent = `$${formatPrice(total)}`;
};

const initCartPage = () => {
  const {
    itemsWrap,
    clearButton,
    checkoutButton,
    feedback,
    removeModalClose,
    removeModalCancel,
    removeModalConfirm,
  } = getCartDom();
  if (!itemsWrap || !clearButton || !checkoutButton || !feedback) return;

  if (itemsWrap.dataset.abCartBound === "true") {
    renderCart();
    return;
  }
  itemsWrap.dataset.abCartBound = "true";

  /* Delegación de eventos para quitar productos. */
  itemsWrap.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-action]");
    if (!(button instanceof HTMLButtonElement)) return;
    const row = button.closest(".ab-cart-item");
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;

    const action = button.dataset.action;
    if (action === "remove") {
      openRemoveModal(id);
      return;
    }
  });

  /* Vaciar carrito completo. */
  clearButton.addEventListener("click", async () => {
    const items = await getCart();
    for (const item of items) {
      await removeFromCart(item.product_id);
    }
    feedback.textContent = "Carrito vaciado.";
    renderCart();
  });

  /* Validar sesión antes de pasar a checkout. */
  checkoutButton.addEventListener("click", async () => {
    const items = await getCart();
    if (items.length === 0) {
      feedback.textContent = "Agregá productos al carrito para continuar.";
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) {
      window.location.href = "/login?returnTo=/finalizar-compra";
      return;
    }
    const groups = groupItemsByProvider(items);
    for (const group of groups) {
      const preference = getProviderShippingPreference(group.key);
      if (!preference.requested) continue;
      if (!group.items.every(itemSupportsShipping)) {
        feedback.textContent = `Hay productos de ${group.provider} que no aceptan envío.`;
        return;
      }
      if (!preference.address || !preference.city) {
        feedback.textContent = "Completá dirección y ciudad en Mis datos para solicitar envío.";
        return;
      }
    }
    window.location.href = "/finalizar-compra";
  });

  itemsWrap.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const group = target.closest(".ab-cart-provider-group");
    if (!group) return;
    persistProviderShippingForm(group);
    if (target.matches("[data-shipping-requested]")) {
      await renderCart();
    }
  });

  const bindModalButton = (element, handler) => {
    if (!(element instanceof HTMLElement)) return;
    if (element.dataset.abCartModalBound === "true") return;
    element.dataset.abCartModalBound = "true";
    element.addEventListener("click", handler);
  };

  bindModalButton(removeModalCancel, () => closeRemoveModal());
  bindModalButton(removeModalClose, () => closeRemoveModal());
  bindModalButton(removeModalConfirm, async () => {
    const productId = pendingRemoveProductId;
    if (!productId) return;

    if (removeModalConfirm instanceof HTMLButtonElement) {
      removeModalConfirm.disabled = true;
      removeModalConfirm.setAttribute("aria-busy", "true");
    }

    await removeFromCart(productId);
    await renderCart();

    if (removeModalConfirm instanceof HTMLButtonElement) {
      removeModalConfirm.disabled = false;
      removeModalConfirm.removeAttribute("aria-busy");
    }

    closeRemoveModal();
  });

  renderCart();
};

const bindCartLifecycleEvents = () => {
  if (document.documentElement.dataset.abCartLifecycleBound === "true") return;
  document.documentElement.dataset.abCartLifecycleBound = "true";

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const { removeModal } = getCartDom();
    if (removeModal?.classList.contains("ab-is-hidden")) return;
    closeRemoveModal();
  });

  window.addEventListener("ab-cart-updated", renderCart);
  document.addEventListener("astro:page-load", initCartPage);
  document.addEventListener("astro:after-swap", initCartPage);
  window.addEventListener("pageshow", initCartPage);
};

/* Render inicial. */
initCartPage();
bindCartLifecycleEvents();
