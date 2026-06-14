/* UI del checkout: resumen, validaciones y confirmación local. */
import { supabase } from "../lib/supabaseClient";
import { getCart } from "../lib/cart";
import { removeFromCart } from "../lib/cart";
import {
  SHIPPING_FEE,
  clearShippingPreference,
  getProviderShippingPreference,
  itemSupportsShipping,
} from "../lib/shippingPreference";

let checkoutConfirmed = false;
let currentSubtotal = 0;
let currentShippingGroups = [];
let checkoutKeydownBound = false;
let lastCheckoutModalTrigger = null;

const getCheckoutDom = () => ({
  emptyState: document.getElementById("checkout-empty"),
  summary: document.getElementById("checkout-summary"),
  itemsWrap: document.getElementById("checkout-items"),
  subtotalLabel: document.getElementById("checkout-subtotal"),
  shippingTotalLabel: document.getElementById("checkout-shipping-total"),
  shippingTotalRow: document.querySelector(".ab-checkout-shipping-total"),
  totalLabel: document.getElementById("checkout-total"),
  form: document.getElementById("checkout-form"),
  feedback: document.getElementById("checkout-feedback"),
  successNotice: document.getElementById("checkout-success"),
  checkoutConfirmModal: document.getElementById("checkout-confirm-modal"),
  checkoutModalClose: document.querySelector("[data-checkout-modal-close]"),
  checkoutModalCancel: document.querySelector("[data-checkout-modal-cancel]"),
  checkoutModalConfirm: document.querySelector("[data-checkout-modal-confirm]"),
});

/* Escapa texto para evitar inyección HTML en render dinámico. */
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/* Obtiene el usuario más actualizado disponible en auth. */
const resolveCheckoutUser = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUser = sessionData?.session?.user;
  if (!sessionUser) return null;

  const { data: userData } = await supabase.auth.getUser();
  return userData?.user ?? sessionUser;
};

/* Formateo de precios ARS. */
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
      groups.set(key, { key, provider, items: [] });
    }
    groups.get(key).items.push(item);
  });
  return [...groups.values()];
};

const getRequestedShippingGroups = (items) => {
  const groups = groupItemsByProvider(items);
  return groups
    .map((group) => ({
      ...group,
      preference: getProviderShippingPreference(group.key),
    }))
    .filter((group) => group.preference.requested);
};

const refreshTotals = () => {
  const { itemsWrap, shippingTotalRow, subtotalLabel, shippingTotalLabel, totalLabel } = getCheckoutDom();
  const shippingCost = currentShippingGroups.length * SHIPPING_FEE;
  document.querySelectorAll("[data-checkout-shipping-item]").forEach((row) => row.remove());
  currentShippingGroups.forEach((group) => {
    if (!itemsWrap) return;
    const row = document.createElement("div");
    row.className = "ab-checkout-item";
    row.dataset.checkoutShippingItem = "true";
    row.innerHTML = `
      <span>Envío a domicilio<small>${escapeHtml(group.provider)}</small></span>
      <strong>$${formatPrice(SHIPPING_FEE)}</strong>
    `;
    itemsWrap.appendChild(row);
  });
  shippingTotalRow?.classList.toggle("ab-is-hidden", currentShippingGroups.length === 0);
  if (subtotalLabel) subtotalLabel.textContent = `$${formatPrice(currentSubtotal)}`;
  if (shippingTotalLabel) shippingTotalLabel.textContent = shippingCost ? `$${formatPrice(shippingCost)}` : "$0";
  if (totalLabel) totalLabel.textContent = `$${formatPrice(currentSubtotal + shippingCost)}`;
};

/* Renderiza el resumen del pedido. */
const renderSummary = async () => {
  const { itemsWrap, emptyState, summary, form, totalLabel, shippingTotalRow, subtotalLabel, shippingTotalLabel } =
    getCheckoutDom();
  if (!itemsWrap || !emptyState || !summary || !form || !totalLabel) return;
  const items = await getCart();
  itemsWrap.innerHTML = "";

  /* Manejo del estado vacío. */
  if (items.length === 0) {
    emptyState.style.display = "grid";
    summary.style.display = "none";
    form.style.display = "none";
    currentSubtotal = 0;
    currentShippingGroups = [];
    shippingTotalRow?.classList.add("ab-is-hidden");
    clearShippingPreference();
    if (subtotalLabel) subtotalLabel.textContent = "$0";
    if (shippingTotalLabel) shippingTotalLabel.textContent = "$0";
    totalLabel.textContent = "$0";
    return;
  }

  emptyState.style.display = "none";
  summary.style.display = "grid";
  form.style.display = "grid";

  /* Cálculo de total y filas del resumen. */
  let total = 0;
  items.forEach((item) => {
    const price = Number(item.price_snapshot ?? 0);
    total += price;
    const title = item.product?.title ?? item.product_id ?? "Producto";
    const deliveryMethods = item.product?.delivery_methods ?? [];
    const deliveryLabel = deliveryMethods.includes("envio")
      ? deliveryMethods.includes("retiro")
        ? "Retiro o envío"
        : "Envío"
      : "Retiro";
    const safeTitle = escapeHtml(title);
    const safeDeliveryLabel = escapeHtml(deliveryLabel);

    const row = document.createElement("div");
    row.className = "ab-checkout-item";
    row.innerHTML = `
      <span>${safeTitle}<small>${safeDeliveryLabel}</small></span>
      <strong>$${formatPrice(price)}</strong>
    `;
    itemsWrap.appendChild(row);
  });

  currentSubtotal = total;
  currentShippingGroups = getRequestedShippingGroups(items).filter((group) => group.items.every(itemSupportsShipping));
  refreshTotals();
};

const initCheckoutPage = () => {
  const {
    form,
    feedback,
    successNotice,
    checkoutConfirmModal,
    checkoutModalClose,
    checkoutModalCancel,
    checkoutModalConfirm,
  } = getCheckoutDom();
  if (!form || !feedback) return;

  if (form.dataset.abCheckoutBound === "true") {
    renderSummary();
    preloadUser();
    return;
  }
  form.dataset.abCheckoutBound = "true";

  const openCheckoutModal = () => {
    if (!checkoutConfirmModal) return;
    lastCheckoutModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    checkoutConfirmModal.classList.remove("ab-is-hidden");
    checkoutConfirmModal.setAttribute("aria-hidden", "false");
    checkoutModalConfirm?.focus();
  };

  const closeCheckoutModal = () => {
    if (!checkoutConfirmModal) return;
    if (checkoutConfirmModal.contains(document.activeElement)) {
      if (lastCheckoutModalTrigger instanceof HTMLElement) {
        lastCheckoutModalTrigger.focus();
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
    lastCheckoutModalTrigger = null;
    checkoutConfirmModal.classList.add("ab-is-hidden");
    checkoutConfirmModal.setAttribute("aria-hidden", "true");
  };

  const processCheckout = async () => {
    /* Feedback UI inmediato. */
    feedback.textContent = "Procesando compra...";

    const items = await getCart();
    const { data } = await supabase.auth.getSession();

    /* Normaliza items para persistir orden y fallback local. */
    const orderItems = items.map((item) => ({
      product_id: item.product_id ?? "",
      name: item.product?.title ?? "Producto",
      qty: 1,
      unit_price: item.price_snapshot ?? 0,
      provider: item.product?.seller_name ?? "N/A",
      provider_whatsapp: item.product?.contact ?? "",
      provider_user_id: item.product?.user_id ?? "",
    }));

    const requestedShippingGroups = getRequestedShippingGroups(items);
    const shippingRequested = requestedShippingGroups.length > 0;
    const shippingCost = requestedShippingGroups.length * SHIPPING_FEE;
    const shippingAddressSummary = requestedShippingGroups
      .map((group) => `${group.provider}: ${[group.preference.address, group.preference.city].filter(Boolean).join(", ")}`)
      .join(" | ");
    const shipping = {
      requested: shippingRequested,
      cost: shippingCost,
      fullName: String(document.getElementById("full-name")?.value ?? "").trim(),
      address: shippingRequested ? shippingAddressSummary : "",
      city: shippingRequested ? "Por proveedor" : "",
      phone: String(document.getElementById("phone")?.value ?? "").trim(),
      groups: requestedShippingGroups.map((group) => ({
        provider_key: group.key,
        provider: group.provider,
        requested: true,
        cost: SHIPPING_FEE,
        address: group.preference.address,
        city: group.preference.city,
      })),
    };
    const buyerNote = String(document.getElementById("notes")?.value ?? "").trim().slice(0, 500);

    try {
      const response = await fetch("/api/checkout-manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          items: orderItems,
          shipping,
          buyer_note: buyerNote,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error ?? "No se pudo registrar la compra."));
      }
    } catch (error) {
      feedback.textContent =
        error instanceof Error
          ? error.message
          : "No se pudo registrar la compra. Intentá nuevamente.";
      return;
    }

    /* Vacía el carrito luego de confirmar. */
    for (const item of items) {
      await removeFromCart(item.product_id);
    }
    clearShippingPreference();

    /* UI de éxito y redirección. */
    if (form) form.classList.add("ab-is-hidden");
    if (successNotice) successNotice.classList.remove("ab-is-hidden");
    feedback.textContent = "Compra confirmada. Avisamos al vendedor.";
    window.setTimeout(() => {
      window.location.href = "/mis-compras";
    }, 900);
  };

  /* Submit del checkout: validación, guardado local y redirección. */
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!checkoutConfirmed) {
      openCheckoutModal();
      return;
    }
    checkoutConfirmed = false;
    closeCheckoutModal();

    const items = await getCart();
    if (items.length === 0) {
      feedback.textContent = "No hay productos para procesar.";
      return;
    }

    const requestedShippingGroups = getRequestedShippingGroups(items);
    for (const group of requestedShippingGroups) {
      if (!group.items.every(itemSupportsShipping)) {
        feedback.textContent = `Hay productos de ${group.provider} que no aceptan envío.`;
        return;
      }
      if (!group.preference.address || !group.preference.city) {
        feedback.textContent = `Volvé al carrito y completá dirección y ciudad para el envío de ${group.provider}.`;
        return;
      }
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      window.location.href = "/login?returnTo=/finalizar-compra";
      return;
    }
    await processCheckout();
  });

  const bindModalButton = (element, handler) => {
    if (!(element instanceof HTMLElement)) return;
    if (element.dataset.abCheckoutModalBound === "true") return;
    element.dataset.abCheckoutModalBound = "true";
    element.addEventListener("click", handler);
  };

  bindModalButton(checkoutModalCancel, () => {
    checkoutConfirmed = false;
    closeCheckoutModal();
  });

  bindModalButton(checkoutModalClose, () => {
    checkoutConfirmed = false;
    closeCheckoutModal();
  });

  bindModalButton(checkoutModalConfirm, () => {
    checkoutConfirmed = true;
    form.requestSubmit();
  });

  if (!checkoutKeydownBound) {
    checkoutKeydownBound = true;
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const { checkoutConfirmModal: currentModal } = getCheckoutDom();
      if (currentModal?.classList.contains("ab-is-hidden")) return;
      checkoutConfirmed = false;
      const { checkoutConfirmModal: modal } = getCheckoutDom();
      if (!modal) return;
      modal.classList.add("ab-is-hidden");
      modal.setAttribute("aria-hidden", "true");
    });
  }

  renderSummary();
  preloadUser();
};

/* Precarga datos del usuario en el formulario. */
const preloadUser = async () => {
  const user = await resolveCheckoutUser();
  if (!user) {
    window.location.href = "/login?returnTo=/finalizar-compra";
    return;
  }
  const metadata = user.user_metadata ?? {};
  const fullName = `${metadata.first_name ?? ""} ${metadata.last_name ?? ""}`.trim();
  const fullNameInput = document.getElementById("full-name");
  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");

  if (fullName && fullNameInput) fullNameInput.value = fullName;
  if (user.email && emailInput) emailInput.value = user.email;
  if (metadata.phone && phoneInput) phoneInput.value = metadata.phone;
};

/* Inicialización. */
initCheckoutPage();
window.addEventListener("ab-shipping-preference-updated", renderSummary);
document.addEventListener("ab-shipping-preference-updated", renderSummary);
document.addEventListener("astro:page-load", initCheckoutPage);
document.addEventListener("astro:after-swap", initCheckoutPage);
window.addEventListener("pageshow", initCheckoutPage);
