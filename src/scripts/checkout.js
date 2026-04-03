import { supabase } from "../lib/supabaseClient";

const CART_KEY = "ab_cart_v1";
const emptyState = document.getElementById("checkout-empty");
const summary = document.getElementById("checkout-summary");
const itemsWrap = document.getElementById("checkout-items");
const totalLabel = document.getElementById("checkout-total");
const form = document.getElementById("checkout-form");
const feedback = document.getElementById("checkout-feedback");

const loadCart = () => {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const formatPrice = (value) => {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("es-AR");
};

const renderSummary = () => {
  if (!itemsWrap || !emptyState || !summary || !form || !totalLabel) return;
  const items = loadCart();
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
    const qty = item.qty ?? 1;
    const price = Number(item.price ?? 0);
    total += price * qty;

    const row = document.createElement("div");
    row.className = "ab-checkout-item";
    row.innerHTML = `
      <span>${item.name} x ${qty}</span>
      <strong>$${formatPrice(price * qty)}</strong>
    `;
    itemsWrap.appendChild(row);
  });

  totalLabel.textContent = `$${formatPrice(total)}`;
};

if (form && feedback) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const items = loadCart();
    if (items.length === 0) {
      feedback.textContent = "No hay productos para procesar.";
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      window.location.href = "/login?returnTo=/finalizar-compra";
      return;
    }

    feedback.textContent = "Creando orden y redirigiendo a Mercado Pago...";

    const payload = {
      items,
      shipping: {
        fullName: document.getElementById("full-name")?.value ?? "",
        address: document.getElementById("address")?.value ?? "",
        city: document.getElementById("city")?.value ?? "",
        phone: document.getElementById("phone")?.value ?? "",
      },
    };

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        feedback.textContent = result?.error || "No se pudo crear la orden.";
        return;
      }

      if (result?.init_point) {
        window.location.href = result.init_point;
        return;
      }

      feedback.textContent = "No se recibió link de pago.";
    } catch (error) {
      feedback.textContent = "Ocurrió un error al procesar el pago.";
      console.error(error);
    }
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
  const cityInput = document.getElementById("city");
  const phoneInput = document.getElementById("phone");

  if (fullName && fullNameInput) fullNameInput.value = fullName;
  if (metadata.address && addressInput) addressInput.value = metadata.address;
  if (metadata.city && cityInput) cityInput.value = metadata.city;
  if (metadata.phone && phoneInput) phoneInput.value = metadata.phone;
};

renderSummary();
preloadUser();
