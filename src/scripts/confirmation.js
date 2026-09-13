import { buildPurchaseDetailHtml } from "../lib/purchaseDetail.js";
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
let invoiceButton = document.getElementById("confirmation-invoice");
let currentOrder = null;

const params = () => new URLSearchParams(window.location.search);
const orderId = () => params().get("orderId");
const status = () => String(params().get("status") ?? "").trim().toLowerCase();
const cleanParam = (value) => {
  const safeValue = String(value ?? "").trim();
  return safeValue && safeValue !== "null" ? safeValue : "";
};

const paymentId = () => cleanParam(params().get("payment_id") ?? params().get("collection_id"));

const bindConfirmationElements = () => {
  title = document.getElementById("confirmation-title");
  message = document.getElementById("confirmation-message");
  orderLabel = document.getElementById("confirmation-order");
  invoiceButton = document.getElementById("confirmation-invoice");
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
  refund_pending: {
    title: "Reembolso pendiente",
    message: "El reembolso estÃ¡ en proceso. Conservamos el movimiento en el detalle de compra.",
  },
  partially_refunded: {
    title: "Reembolso parcial",
    message: "La compra registra un reembolso parcial.",
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

const openCurrentInvoice = () => {
  if (!currentOrder) return;
  const invoiceWindow = window.open("", "_blank");
  if (!invoiceWindow) {
    if (message) message.textContent = "El navegador bloqueó el detalle de compra. Permití ventanas emergentes para AnuBorns.";
    return;
  }

  invoiceWindow.document.open();
  invoiceWindow.document.write(buildPurchaseDetailHtml(currentOrder));
  invoiceWindow.document.close();
  invoiceWindow.opener = null;
  invoiceWindow.focus();
};

const setInvoiceButtonVisible = (visible) => {
  if (!invoiceButton) return;
  invoiceButton.classList.toggle("ab-is-hidden", !visible);
  invoiceButton.disabled = !visible;
};

const getEffectiveStatus = (orderStatus, urlStatus) => {
  const safeOrderStatus = String(orderStatus ?? "").trim().toLowerCase();
  const safeUrlStatus = String(urlStatus ?? "").trim().toLowerCase();
  if (safeOrderStatus) return safeOrderStatus;
  return safeUrlStatus;
};

const syncMercadoPagoStatus = async (id) => {
  const safeOrderId = String(id ?? "").trim();
  if (!safeOrderId) return "";

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? "";
  if (!token) return "";

  const response = await fetch("/api/mercadopago-payment-sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      orderId: safeOrderId,
      status: status(),
      payment_id: paymentId(),
      collection_id: params().get("collection_id"),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return "";
  return String(payload?.status ?? "").trim().toLowerCase();
};

/* Carga y muestra información resumida de la orden. */
const loadOrder = async () => {
  bindConfirmationElements();
  if (invoiceButton && invoiceButton.dataset.invoiceBound !== "true") {
    invoiceButton.addEventListener("click", openCurrentInvoice);
    invoiceButton.dataset.invoiceBound = "true";
  }
  setInvoiceButtonVisible(false);
  currentOrder = null;
  const urlStatus = status();
  renderStatus(urlStatus);
  const id = orderId();
  if (!id) return;
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, created_at, status, total_amount, currency, payment_id, preference_id, payment_detail, shipping_requested, shipping_cost, shipping_address, shipping_city, order_items (name, qty, unit_price, provider)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!error && data) {
    const syncedStatus = await syncMercadoPagoStatus(id);
    const effectiveStatus = getEffectiveStatus(syncedStatus || data.status, urlStatus);
    currentOrder = { ...data, status: effectiveStatus };
    setInvoiceButtonVisible(true);
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
