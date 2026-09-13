import { purchaseDetailStyles } from "./purchaseDetailStyles.js";

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

export const formatOrderPaymentStatus = (value) => {
  const labels = {
    approved: "Pago aprobado",
    pending: "Pago pendiente",
    rejected: "Pago rechazado",
    cancelled: "Pago cancelado",
    canceled: "Pago cancelado",
    refunded: "Pago reembolsado",
  };
  const statusValue = String(value ?? "").trim().toLowerCase();
  return labels[statusValue] ?? "Compra registrada";
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

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

export const buildPurchaseDetailHtml = (order, { buyerNote = "" } = {}) => {
  const isCancelled = ["cancelled", "canceled"].includes(String(order?.status ?? "").trim().toLowerCase());
  const providers = [...new Set(
    (Array.isArray(order?.order_items) ? order.order_items : [])
      .map((item) => String(item?.provider ?? "").trim())
      .filter(Boolean),
  )];
  const providerHeading = providers.length
    ? `${providers.length === 1 ? "Vendedor" : "Vendedores"}: ${providers.join(" · ")}`
    : "Vendedor no informado";
  const orderId = String(order?.id ?? "").trim();
  const currency = String(order?.currency ?? "ARS").trim() || "ARS";
  const paymentStatus = formatOrderPaymentStatus(order?.status);
  const shippingRequested = Boolean(order?.shipping_requested);
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
  <title>Detalle de compra ${escapeHtml(orderId.slice(0, 8).toUpperCase() || "Sin referencia")}</title>
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
        <p><strong>Compra</strong> ${orderId ? "#" + escapeHtml(orderId.slice(0, 8).toUpperCase()) : "Sin referencia"}</p>
        <p class="muted">${escapeHtml(formatInvoiceDateTime(order?.created_at))}</p>
      </div>
    </header>

    ${isCancelled ? `<aside class="cancelled-notice"><strong>Pago cancelado</strong><p>El importe corresponde a los productos de esta compra. No es una constancia de cobro ni de reembolso.</p></aside>` : ""}

    <section class="grid" aria-label="Datos de compra">
      <p class="field"><strong>Estado de pago</strong>${escapeHtml(paymentStatus)}</p>
      <p class="field"><strong>Moneda</strong>${escapeHtml(currency)}</p>
      <p class="field"><strong>Entrega</strong>${isCancelled ? "No corresponde · pago cancelado" : shippingRequested ? "Envio a domicilio" : "Retiro coordinado"}</p>
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

    ${buyerNote ? `<h2>Nota</h2><p>${escapeHtml(buyerNote)}</p>` : ""}

    <div class="actions">
      <button type="button" onclick="window.print()">Imprimir</button>
    </div>
  </main>
</body>
</html>`;
};
