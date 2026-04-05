import { supabase } from "../lib/supabaseClient";

const ORDERS_KEY = "ab_orders_v1";

const list = document.getElementById("orders-list");
const emptyState = document.getElementById("orders-empty");
const status = document.getElementById("orders-status");

const formatPrice = (value) => {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("es-AR");
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const renderHistory = (history = []) => {
  if (!list) return;
  list.innerHTML = "";

  if (!Array.isArray(history) || history.length === 0) {
    return;
  }

  history.forEach((order) => {
    const wrapper = document.createElement("article");
    wrapper.className = "ab-order-card";
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    wrapper.innerHTML = `
      <div class="ab-order-card__header">
        <div>
          <p class="ab-order-card__label">Orden ${order.id?.slice(0, 8) ?? ""}</p>
          <p class="ab-order-card__date">${formatDate(order.created_at)}</p>
        </div>
        <strong>$${formatPrice(order.total_amount ?? 0)}</strong>
      </div>
      <ul class="ab-order-card__items">
        ${items
          .map((item) => {
            const qty = item.qty ?? 1;
            const price = Number(item.unit_price ?? 0);
            const provider = item.provider ?? "N/A";
            return `
              <li>
                <div>
                  <strong>${item.name} x ${qty}</strong>
                  <p>Proveedor: ${provider}</p>
                </div>
                <span>$${formatPrice(price * qty)}</span>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
    list.appendChild(wrapper);
  });
};

const renderOrders = () => {
  if (!list || !emptyState) return;
  const hasHistory = list.children.length > 0;
  emptyState.style.display = hasHistory ? "none" : "grid";
};

const loadOrders = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) {
    if (status) status.textContent = "Tenés que iniciar sesión para ver tus compras.";
    window.location.href = "/login?returnTo=/mis-compras";
    return;
  }

  const userId = sessionData.session.user.id;
  try {
    const raw = window.localStorage.getItem(ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const localOrders = Array.isArray(parsed[userId]) ? parsed[userId] : [];
    if (localOrders.length > 0) {
      if (status) status.textContent = "";
      renderHistory(localOrders);
      renderOrders();
      return;
    }
  } catch {
    // fall through to remote
  }

  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, total_amount, status, order_items (name, qty, unit_price, provider)")
    .order("created_at", { ascending: false });

  if (error) {
    if (status) status.textContent = `Error cargando órdenes: ${error.message}`;
    return;
  }

  if (status) status.textContent = "";
  renderHistory(data ?? []);
  renderOrders();
};

loadOrders();
