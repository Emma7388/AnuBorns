import { supabase } from "../lib/supabaseClient";

const CART_KEY = "ab_cart_v1";
const itemsWrap = document.getElementById("cart-items");
const emptyState = document.getElementById("cart-empty");
const totalLabel = document.getElementById("cart-total");
const clearButton = document.getElementById("cart-clear");
const checkoutButton = document.getElementById("cart-checkout");
const feedback = document.getElementById("cart-feedback");

const loadCart = () => {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveCart = (items) => {
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
};

const formatPrice = (value) => {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("es-AR");
};

const renderCart = () => {
  if (!itemsWrap || !emptyState || !totalLabel) return;
  const items = loadCart();
  itemsWrap.innerHTML = "";

  if (items.length === 0) {
    emptyState.style.display = "grid";
    totalLabel.textContent = "$0";
    return;
  }

  emptyState.style.display = "none";

  let total = 0;
  items.forEach((item) => {
    const qty = item.qty ?? 1;
    const price = Number(item.price ?? 0);
    total += price * qty;

    const row = document.createElement("article");
    row.className = "ab-cart-item";
    row.dataset.id = item.id;
    row.innerHTML = `
      <img class="ab-cart-item__image" src="${item.image ?? "/logo2.svg"}" alt="${item.name}" loading="lazy" />
      <div class="ab-cart-item__info">
        <h2 class="ab-cart-item__title">${item.name}</h2>
        <p class="ab-cart-item__meta">Proveedor: ${item.provider ?? "N/A"}</p>
        <p class="ab-cart-item__meta">Precio: $${formatPrice(price)} / ${item.unit ?? ""}</p>
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

const updateItem = (id, delta) => {
  const items = loadCart();
  const item = items.find((entry: any) => entry.id === id);
  if (!item) return;
  item.qty = Math.max(1, (item.qty ?? 1) + delta);
  saveCart(items);
};

const removeItem = (id: string) => {
  const items = loadCart().filter((entry) => entry.id !== id);
  saveCart(items);
};

if (itemsWrap && clearButton && checkoutButton && feedback) {
  itemsWrap.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const row = target.closest(".ab-cart-item");
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;

    const action = target.dataset.action;
    if (action === "inc") updateItem(id, 1);
    if (action === "dec") updateItem(id, -1);
    if (action === "remove") removeItem(id);

    renderCart();
  });

  clearButton.addEventListener("click", () => {
    saveCart([]);
    feedback.textContent = "Carrito vaciado.";
    renderCart();
  });

  checkoutButton.addEventListener("click", async () => {
    const items = loadCart();
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

renderCart();
