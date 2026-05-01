/* UI del checkout: resumen, validaciones y confirmación local. */
import { supabase } from "../lib/supabaseClient";
import { getCart } from "../lib/cart";
import { removeFromCart } from "../lib/cart";

/* Clave de almacenamiento local para historial de compras offline. */
const ORDERS_KEY = "ab_orders_v1";
/* Referencias DOM principales. */
const emptyState = document.getElementById("checkout-empty");
const summary = document.getElementById("checkout-summary");
const itemsWrap = document.getElementById("checkout-items");
const totalLabel = document.getElementById("checkout-total");
const form = document.getElementById("checkout-form");
const feedback = document.getElementById("checkout-feedback");
const successNotice = document.getElementById("checkout-success");
const checkoutConfirmModal = document.getElementById("checkout-confirm-modal");
const checkoutModalClose = document.querySelector("[data-checkout-modal-close]");
const checkoutModalCancel = document.querySelector("[data-checkout-modal-cancel]");
const checkoutModalConfirm = document.querySelector("[data-checkout-modal-confirm]");
let checkoutConfirmed = false;

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

/* Renderiza el resumen del pedido. */
const renderSummary = async () => {
  if (!itemsWrap || !emptyState || !summary || !form || !totalLabel) return;
  const items = await getCart();
  itemsWrap.innerHTML = "";

  /* Manejo del estado vacío. */
  if (items.length === 0) {
    emptyState.style.display = "grid";
    summary.style.display = "none";
    form.style.display = "none";
    totalLabel.textContent = "$0";
    return;
  }

  emptyState.style.display = "none";
  summary.style.display = "grid";
  form.style.display = "grid";

  /* Cálculo de total y filas del resumen. */
  let total = 0;
  items.forEach((item) => {
    const qty = item.quantity ?? 1;
    const price = Number(item.price_snapshot ?? 0);
    total += price * qty;
    const title = item.product?.title ?? item.product_id ?? "Producto";
    const safeTitle = escapeHtml(title);

    const row = document.createElement("div");
    row.className = "ab-checkout-item";
    row.innerHTML = `
      <span>${safeTitle} x ${qty}</span>
      <strong>$${formatPrice(price * qty)}</strong>
    `;
    itemsWrap.appendChild(row);
  });

  totalLabel.textContent = `$${formatPrice(total)}`;
};

if (form && feedback) {
  const openCheckoutModal = () => {
    if (!checkoutConfirmModal) return;
    checkoutConfirmModal.classList.remove("ab-is-hidden");
    checkoutConfirmModal.setAttribute("aria-hidden", "false");
    checkoutModalConfirm?.focus();
  };

  const closeCheckoutModal = () => {
    if (!checkoutConfirmModal) return;
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
      qty: item.quantity ?? 1,
      unit_price: item.price_snapshot ?? 0,
      provider: item.product?.seller_name ?? "N/A",
      provider_whatsapp: item.product?.contact ?? "",
      provider_user_id: item.product?.user_id ?? "",
    }));

    const total = orderItems.reduce((sum, item) => sum + (item.unit_price ?? 0) * (item.qty ?? 1), 0);
    const shipping = {
      fullName: String(document.getElementById("full-name")?.value ?? "").trim(),
      address: String(document.getElementById("address")?.value ?? "").trim(),
      city: String(document.getElementById("city")?.value ?? "").trim(),
      phone: String(document.getElementById("phone")?.value ?? "").trim(),
    };
    const buyerNote = String(document.getElementById("notes")?.value ?? "").trim().slice(0, 500);

    let persistedRemotely = false;
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
      if (!response.ok) {
        throw new Error("manual-checkout-failed");
      }
      persistedRemotely = true;
    } catch {
      /* Fallback local para no bloquear compra si falla backend. */
      const rawOrders = window.localStorage.getItem(ORDERS_KEY);
      const parsed = rawOrders ? JSON.parse(rawOrders) : {};
      const userId = data.session.user.id;
      const userOrders = Array.isArray(parsed[userId]) ? parsed[userId] : [];
      const newOrder = {
        id: `LOCAL-${Date.now()}`,
        created_at: new Date().toISOString(),
        total_amount: total,
        buyer_note: buyerNote || "",
        order_items: orderItems,
      };
      parsed[userId] = [newOrder, ...userOrders];
      window.localStorage.setItem(ORDERS_KEY, JSON.stringify(parsed));
    }

    /* Vacía el carrito luego de confirmar. */
    for (const item of items) {
      await removeFromCart(item.product_id);
    }

    /* UI de éxito y redirección. */
    if (form) form.classList.add("ab-is-hidden");
    if (successNotice) successNotice.classList.remove("ab-is-hidden");
    if (!persistedRemotely) {
      feedback.textContent = "Compra confirmada. Se guardo localmente por un problema temporal del servidor.";
    }
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

    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      window.location.href = "/login?returnTo=/finalizar-compra";
      return;
    }
    await processCheckout();
  });

  checkoutModalCancel?.addEventListener("click", () => {
    checkoutConfirmed = false;
    closeCheckoutModal();
  });

  checkoutModalClose?.addEventListener("click", () => {
    checkoutConfirmed = false;
    closeCheckoutModal();
  });

  checkoutModalConfirm?.addEventListener("click", () => {
    checkoutConfirmed = true;
    form.requestSubmit();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (checkoutConfirmModal?.classList.contains("ab-is-hidden")) return;
    checkoutConfirmed = false;
    closeCheckoutModal();
  });
}

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
renderSummary();
preloadUser();
