import { purchaseDetailStyles } from "../lib/purchaseDetailStyles.js";
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

const formatPrice = (value) => {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("es-AR");
};

const formatInvoiceDateTime = (value) => {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

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

const formatOrderPaymentStatus = (value) => {
  const labels = {
    approved: "Pago aprobado",
    pending: "Pago pendiente",
    rejected: "Pago rechazado",
    cancelled: "Pago cancelado",
    refunded: "Pago reembolsado",
  };
  const statusValue = String(value ?? "").trim().toLowerCase();
  return labels[statusValue] ?? "Compra registrada";
};

const buildInvoiceItemsRows = (order) => {
  const items = Array.isArray(order?.order_items) ? order.order_items : [];
  if (items.length === 0) {
    return `<tr><td colspan="5" class="muted">Sin productos registrados.</td></tr>`;
  }

  return items
    .map((item) => {
      const qty = Number(item?.qty ?? 1) || 1;
      const unitPrice = Number(item?.unit_price ?? 0) || 0;
      const lineTotal = qty * unitPrice;
      return `
        <tr>
          <td>${escapeHtml(item?.name ?? "Producto")}</td>
          <td>${escapeHtml(item?.provider ?? "Proveedor")}</td>
          <td class="number">${escapeHtml(qty)}</td>
          <td class="number">$${formatPrice(unitPrice)}</td>
          <td class="number">$${formatPrice(lineTotal)}</td>
        </tr>
      `;
    })
    .join("");
};

const buildOrderInvoiceHtml = (order) => {
  const isCancelled = ["cancelled", "canceled"].includes(String(order?.status ?? "").trim().toLowerCase());
  const providers = [...new Set(
    (Array.isArray(order?.order_items) ? order.order_items : [])
      .map((item) => String(item?.provider ?? "").trim())
      .filter(Boolean),
  )];
  const providerHeading = providers.length
    ? `${providers.length === 1 ? "Vendedor" : "Vendedores"}: ${providers.join(" · ")}`
    : "Vendedor no informado";
  const safeOrderId = String(order?.id ?? "").trim();
  const currency = String(order?.currency ?? "ARS").trim() || "ARS";
  const shippingCost = Number(order?.shipping_cost ?? 0) || 0;
  const shippingAddress = [
    String(order?.shipping_address ?? "").trim(),
    String(order?.shipping_city ?? "").trim(),
  ]
    .filter(Boolean)
    .join(", ");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Detalle de compra ${escapeHtml(safeOrderId.slice(0, 8).toUpperCase() || "Sin referencia")}</title>
  <style>${purchaseDetailStyles}</style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="brand">${escapeHtml(providerHeading)}</p>
        <h1>Detalle de compra</h1>
      </div>
      <div class="meta">
        <p><strong>Compra</strong> ${safeOrderId ? "#" + escapeHtml(safeOrderId.slice(0, 8).toUpperCase()) : "Sin referencia"}</p>
        <p class="muted">${escapeHtml(formatInvoiceDateTime(order?.created_at))}</p>
      </div>
    </header>

    ${isCancelled ? `<aside class="cancelled-notice"><strong>Pago cancelado</strong><p>El importe corresponde a los productos de esta compra. No es una constancia de cobro ni de reembolso.</p></aside>` : ""}

    <section class="grid" aria-label="Datos de compra">
      <p class="field"><strong>Estado de pago</strong>${escapeHtml(formatOrderPaymentStatus(order?.status))}</p>
      <p class="field"><strong>Moneda</strong>${escapeHtml(currency)}</p>
      <p class="field"><strong>Entrega</strong>${isCancelled ? "No corresponde · pago cancelado" : order?.shipping_requested ? "Envio a domicilio" : "Retiro coordinado"}</p>
      <p class="field"><strong>Direccion</strong>${escapeHtml(shippingAddress || "No informada")}</p>
      ${order?.payment_id ? `<p class="field"><strong>Pago</strong>${escapeHtml(order.payment_id)}</p>` : ""}
    </section>

    <h2>Detalle</h2>
    <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th>Vendedor</th>
          <th class="number">Cant.</th>
          <th class="number">Unitario</th>
          <th class="number">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${buildInvoiceItemsRows(order)}
      </tbody>
    </table>
    </div>

    <section class="totals ${isCancelled ? "totals--cancelled" : ""}" aria-label="Totales">
      <div class="total-row"><span>Envio</span><strong>$${formatPrice(shippingCost)}</strong></div>
      <div class="total-row"><span>${isCancelled ? "Importe de la compra cancelada" : "Total"}</span><strong>$${formatPrice(order?.total_amount ?? 0)} ${escapeHtml(currency)}</strong></div>
    </section>

    <div class="actions">
      <button type="button" onclick="window.print()">Imprimir</button>
    </div>
  </main>
</body>
</html>`;
};

const openCurrentInvoice = () => {
  if (!currentOrder) return;
  const invoiceWindow = window.open("", "_blank");
  if (!invoiceWindow) {
    if (message) message.textContent = "El navegador bloqueó el detalle de compra. Permití ventanas emergentes para AnuBorns.";
    return;
  }

  invoiceWindow.document.open();
  invoiceWindow.document.write(buildOrderInvoiceHtml(currentOrder));
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
      "id, created_at, status, total_amount, currency, payment_id, preference_id, shipping_requested, shipping_cost, shipping_address, shipping_city, order_items (name, qty, unit_price, provider)",
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
