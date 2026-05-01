/* UI del carrito: render, acciones y navegación. */
import { supabase } from "../lib/supabaseClient";
import { getCart, updateQuantity, removeFromCart } from "../lib/cart";

/* Referencias DOM principales. */
const itemsWrap = document.getElementById("cart-items");
const emptyState = document.getElementById("cart-empty");
const totalLabel = document.getElementById("cart-total");
const clearButton = document.getElementById("cart-clear");
const checkoutButton = document.getElementById("cart-checkout");
const feedback = document.getElementById("cart-feedback");

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

const formatDeliveryMethods = (value) => {
  if (!Array.isArray(value) || value.length === 0) return "No especificado";
  return value
    .map((item) => {
      if (item === "retiro") return "Retiro";
      if (item === "envio") return "Envío";
      return String(item ?? "").trim();
    })
    .filter(Boolean)
    .join(" + ");
};

/* Renderiza el carrito completo en el DOM. */
const renderCart = async () => {
  if (!itemsWrap || !emptyState || !totalLabel) return;
  const items = await getCart();
  itemsWrap.innerHTML = "";

  /* Estado vacío. */
  if (items.length === 0) {
    emptyState.style.display = "grid";
    totalLabel.textContent = "$0";
    return;
  }

  emptyState.style.display = "none";

  /* Lista de items y total. */
  let total = 0;
  items.forEach((item) => {
    const qty = item.quantity ?? 1;
    const price = Number(item.price_snapshot ?? 0);
    total += price * qty;
    const product = item.product ?? null;
    const title = product?.title ?? item.product_id ?? "Producto";
    const image = product?.image_url ?? "/logo2.svg";
    const provider = product?.seller_name ?? "N/A";
    const currency = product?.currency ?? "ARS";
    const deliveryMethods = formatDeliveryMethods(product?.delivery_methods);
    const safeTitle = escapeHtml(title);
    const safeImage = escapeHtml(image);
    const safeProvider = escapeHtml(provider);
    const safeCurrency = escapeHtml(currency);
    const safeDeliveryMethods = escapeHtml(deliveryMethods);

    const row = document.createElement("article");
    row.className = "ab-cart-item";
    row.dataset.id = item.product_id;
    row.innerHTML = `
      <img class="ab-cart-item__image" src="${safeImage}" alt="${safeTitle}" loading="lazy" />
      <div class="ab-cart-item__info">
        <h2 class="ab-cart-item__title">${safeTitle}</h2>
        <p class="ab-cart-item__meta">Proveedor: ${safeProvider}</p>
        <p class="ab-cart-item__meta">Método de entrega: ${safeDeliveryMethods}</p>
        <p class="ab-cart-item__meta">Precio: $${formatPrice(price)} ${safeCurrency}</p>
      </div>
      <div class="ab-cart-item__actions">
        <div class="ab-cart-item__qty">
          <button type="button" data-action="dec" aria-label="Quitar uno">-</button>
          <span>${qty}</span>
          <button type="button" data-action="inc" aria-label="Sumar uno">+</button>
        </div>
        <p class="ab-cart-item__subtotal">$${formatPrice(price * qty)}</p>
        <button class="ab-cart-item__remove" type="button" data-action="remove">Quitar</button>
      </div>
    `;
    itemsWrap.appendChild(row);
  });

  totalLabel.textContent = `$${formatPrice(total)}`;
};

if (itemsWrap && clearButton && checkoutButton && feedback) {
  /* Delegación de eventos para incrementar, decrementar o quitar. */
  itemsWrap.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const row = target.closest(".ab-cart-item");
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;

    const action = target.dataset.action;
    if (action === "inc") {
      const items = await getCart();
      const item = items.find((entry) => entry.product_id === id);
      const nextQty = (item?.quantity ?? 1) + 1;
      await updateQuantity(id, nextQty);
    }
    if (action === "dec") {
      const items = await getCart();
      const item = items.find((entry) => entry.product_id === id);
      const nextQty = (item?.quantity ?? 1) - 1;
      await updateQuantity(id, nextQty);
    }
    if (action === "remove") {
      await removeFromCart(id);
    }

    await renderCart();
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
    window.location.href = "/finalizar-compra";
  });
}

/* Render inicial. */
renderCart();
