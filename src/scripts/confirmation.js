/* UI de confirmación de compra y limpieza de carrito. */
import { supabase } from "../lib/supabaseClient";
import { getCart, removeFromCart } from "../lib/cart";

/* Limpia el carrito local/persistente tras la confirmación. */
const clearCart = async () => {
  try {
    const items = await getCart();
    for (const item of items) {
      await removeFromCart(item.product_id);
    }
  } catch {
    // noop
  }
};

/* Referencias DOM y parámetros de URL. */
const title = document.getElementById("confirmation-title");
const message = document.getElementById("confirmation-message");
const orderLabel = document.getElementById("confirmation-order");

const params = new URLSearchParams(window.location.search);
const orderId = params.get("orderId");
const status = params.get("status");

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

/* Renderiza la UI según estado. */
const renderStatus = (value) => {
  const info = statusMap[value ?? ""] ?? {
    title: "Estado del pago",
    message: "Estamos procesando tu compra.",
  };
  if (title) title.textContent = info.title;
  if (message) message.textContent = info.message;
};

/* Carga y muestra información resumida de la orden. */
const loadOrder = async () => {
  renderStatus(status);
  if (!orderId) return;
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, total_amount")
    .eq("id", orderId)
    .maybeSingle();
  if (!error && data && orderLabel) {
    orderLabel.textContent = `Orden ${data.id.slice(0, 8)} · Total $${Number(data.total_amount).toLocaleString("es-AR")}`;
  }
};

/* Inicialización. */
loadOrder();
clearCart();
