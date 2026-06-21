/* Interfaz de confirmación de compra y limpieza de carrito. */
import { supabase } from "../lib/supabaseClient";
import { getCart, removeFromCart } from "../lib/cart";
import { clearShippingPreference } from "../lib/shippingPreference";

/* Limpia el carrito local/persistente tras la confirmación. */
const clearCart = async () => {
  try {
    const items = await getCart();
    for (const item of items) {
      await removeFromCart(item.product_id);
    }
    clearShippingPreference();
  } catch {
    // Sin acción: limpiar carrito no debe bloquear la confirmación visual.
  }
};

/* Referencias DOM y parámetros de URL. */
let title = document.getElementById("confirmation-title");
let message = document.getElementById("confirmation-message");
let orderLabel = document.getElementById("confirmation-order");

const params = () => new URLSearchParams(window.location.search);
const orderId = () => params().get("orderId");
const status = () => String(params().get("status") ?? "").trim().toLowerCase();

const bindConfirmationElements = () => {
  title = document.getElementById("confirmation-title");
  message = document.getElementById("confirmation-message");
  orderLabel = document.getElementById("confirmation-order");
};

/* Mapeo de estados a textos de UI. */
const statusMap = {
  approved: {
    title: "Pago aprobado",
    message: "Gracias por tu compra. Vamos a preparar tu pedido.",
  },
  pending: {
    title: "Pago pendiente",
    message: "El pago está pendiente de confirmación.",
  },
  rejected: {
    title: "Pago rechazado",
    message: "El pago fue rechazado. Podés intentarlo nuevamente.",
  },
  cancelled: {
    title: "Pago cancelado",
    message: "El pago fue cancelado por el usuario.",
  },
  refunded: {
    title: "Pago reembolsado",
    message: "El pago fue reembolsado.",
  },
  failure: {
    title: "Pago rechazado",
    message: "El pago no pudo procesarse. Podés intentarlo nuevamente.",
  },
};

/* Renderiza la interfaz según estado. */
const renderStatus = (value) => {
  const info = statusMap[value ?? ""] ?? {
    title: "Estado del pago",
    message: "Estamos procesando tu compra.",
  };
  if (title) title.textContent = info.title;
  if (message) message.textContent = info.message;
};

const getEffectiveStatus = (orderStatus, urlStatus) => {
  const safeOrderStatus = String(orderStatus ?? "").trim().toLowerCase();
  const safeUrlStatus = String(urlStatus ?? "").trim().toLowerCase();
  if (safeUrlStatus === "approved" && (!safeOrderStatus || safeOrderStatus === "pending")) {
    return "approved";
  }
  if (safeOrderStatus) return safeOrderStatus;
  return safeUrlStatus;
};

/* Carga y muestra información resumida de la orden. */
const loadOrder = async () => {
  bindConfirmationElements();
  const urlStatus = status();
  renderStatus(urlStatus);
  const id = orderId();
  if (!id) return;
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, total_amount")
    .eq("id", id)
    .maybeSingle();
  if (!error && data) {
    const effectiveStatus = getEffectiveStatus(data.status, urlStatus);
    renderStatus(effectiveStatus);
    if (orderLabel) {
      orderLabel.textContent = `Orden ${data.id.slice(0, 8)} · Total $${Number(data.total_amount).toLocaleString("es-AR")}`;
    }
    if (effectiveStatus === "approved") {
      await clearCart();
    }
  }
};

/* Inicialización y eventos de navegación de Astro. */
bindConfirmationElements();
loadOrder();
document.addEventListener("astro:page-load", () => {
  bindConfirmationElements();
  loadOrder();
});
document.addEventListener("astro:after-swap", () => {
  bindConfirmationElements();
  loadOrder();
});
window.addEventListener("pageshow", () => {
  bindConfirmationElements();
  loadOrder();
});
