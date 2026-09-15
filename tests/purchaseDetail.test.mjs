import test from "node:test";
import assert from "node:assert/strict";
import { buildPurchaseDetailHtml, formatOrderPaymentStatus } from "../src/lib/purchaseDetail.js";

const order = {
  id: "198f5313-11df-42d5-8b93-b495b933ce0c",
  status: "approved",
  created_at: "2026-06-25T12:54:00Z",
  total_amount: 210,
  shipping_cost: 10,
  currency: "ARS",
  order_items: [{ name: "Producto", provider: "María", qty: 2, unit_price: 100 }],
};

test("muestra vendedor, referencia y cantidades sin exponer la preferencia", () => {
  const html = buildPurchaseDetailHtml({
    ...order,
    preference_id: "preferencia-privada",
    payment_detail: "mp_preference|marketplace_fee:0|marketplace:omitted|oauth_seller:257559702",
  });
  assert.match(html, /Vendedor: María/);
  assert.match(html, /#198F5313/);
  assert.match(html, /Pago aprobado/);
  assert.match(html, />\$200</);
  assert.match(html, />\$210 ARS</);
  assert.doesNotMatch(html, /preferencia-privada|mp_preference|marketplace_fee|oauth_seller|Factura de compra|Vendedor: AnuBorns/);
});

test("omite envío sin costo y muestra campos legibles", () => {
  const html = buildPurchaseDetailHtml({
    ...order,
    shipping_requested: false,
    shipping_cost: 0,
    payment_detail: "mp_preference|marketplace_fee:0|marketplace:omitted|oauth_seller:257559702",
  });
  assert.match(html, /<strong>Estado de pago<\/strong><span>Pago aprobado<\/span>/);
  assert.match(html, /<strong>Dirección<\/strong><span>No informada<\/span>/);
  assert.match(html, /Retiro coordinado/);
  assert.doesNotMatch(html, /<span>Envío<\/span>|mp_preference|marketplace_fee|oauth_seller/);
});

test("ambas variantes de cancelación omiten una entrega activa", () => {
  for (const status of ["cancelled", "canceled"]) {
    const html = buildPurchaseDetailHtml({ ...order, status, shipping_requested: true });
    assert.equal(formatOrderPaymentStatus(status), "Pago cancelado");
    assert.match(html, /No corresponde - pago cancelado/);
    assert.match(html, /Importe de la compra cancelada/);
    assert.doesNotMatch(html, /Envío a domicilio|Retiro coordinado/);
  }
});

test("escapa contenido externo y conserva las notas opcionales", () => {
  const html = buildPurchaseDetailHtml({
    ...order,
    shipping_address: '<img src=x onerror="alert(1)">',
    order_items: [{ name: "<script>ataque</script>", provider: "A & B", qty: 1, unit_price: 100 }],
  }, { buyerNote: "<b>Nota</b>" });
  assert.doesNotMatch(html, /<script>|<img src=x|<b>Nota/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /&lt;b&gt;Nota&lt;\/b&gt;/);
});

test("tolera compras sin productos y fecha inválida", () => {
  const html = buildPurchaseDetailHtml({ created_at: "fecha inválida" });
  assert.match(html, /Sin productos registrados/);
  assert.match(html, /Sin fecha/);
  assert.match(html, /Vendedor no informado/);
  assert.doesNotMatch(html, /NaN|undefined/);
});
