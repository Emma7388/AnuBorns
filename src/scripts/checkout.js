import { supabase } from "../lib/supabaseClient";
import { getCart } from "../lib/cart";
import { removeFromCart } from "../lib/cart";

const ORDERS_KEY = "ab_orders_v1";
const emptyState = document.getElementById("checkout-empty");
const summary = document.getElementById("checkout-summary");
const itemsWrap = document.getElementById("checkout-items");
const totalLabel = document.getElementById("checkout-total");
const form = document.getElementById("checkout-form");
const feedback = document.getElementById("checkout-feedback");
const successNotice = document.getElementById("checkout-success");

const formatPrice = (value) => {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("es-AR");
};

const renderSummary = async () => {
  if (!itemsWrap || !emptyState || !summary || !form || !totalLabel) return;
  const items = await getCart();
  itemsWrap.innerHTML = "";

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

  let total = 0;
  items.forEach((item) => {
    const qty = item.quantity ?? 1;
    const price = Number(item.price_snapshot ?? 0);
    total += price * qty;
    const title = item.product?.title ?? item.product_id ?? "Producto";

    const row = document.createElement("div");
    row.className = "ab-checkout-item";
    row.innerHTML = `
      <span>${title} x ${qty}</span>
      <strong>$${formatPrice(price * qty)}</strong>
    `;
    itemsWrap.appendChild(row);
  });

  totalLabel.textContent = `$${formatPrice(total)}`;
};

if (form && feedback) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
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

    feedback.textContent = "Procesando compra...";

    const orderItems = items.map((item) => ({
      name: item.product?.title ?? "Producto",
      qty: item.quantity ?? 1,
      unit_price: item.price_snapshot ?? 0,
      provider: item.product?.seller_name ?? "N/A",
    }));

    const total = orderItems.reduce((sum, item) => sum + (item.unit_price ?? 0) * (item.qty ?? 1), 0);

    const rawOrders = window.localStorage.getItem(ORDERS_KEY);
    const parsed = rawOrders ? JSON.parse(rawOrders) : {};
    const userId = data.session.user.id;
    const userOrders = Array.isArray(parsed[userId]) ? parsed[userId] : [];
    const newOrder = {
      id: `LOCAL-${Date.now()}`,
      created_at: new Date().toISOString(),
      total_amount: total,
      order_items: orderItems,
    };
    parsed[userId] = [newOrder, ...userOrders];
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(parsed));

    for (const item of items) {
      await removeFromCart(item.product_id);
    }

    if (form) form.classList.add("ab-is-hidden");
    if (successNotice) successNotice.classList.remove("ab-is-hidden");
    window.setTimeout(() => {
      window.location.href = "/mis-compras";
    }, 900);
  });
}

const preloadUser = async () => {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.user) {
    window.location.href = "/login?returnTo=/finalizar-compra";
    return;
  }
  const metadata = session.user.user_metadata ?? {};
  const fullName = `${metadata.first_name ?? ""} ${metadata.last_name ?? ""}`.trim();
  const fullNameInput = document.getElementById("full-name");
  const addressInput = document.getElementById("address");
  const phoneInput = document.getElementById("phone");

  if (fullName && fullNameInput) fullNameInput.value = fullName;
  if (metadata.address && addressInput) addressInput.value = metadata.address;
  if (metadata.phone && phoneInput) phoneInput.value = metadata.phone;
};

renderSummary();
preloadUser();
