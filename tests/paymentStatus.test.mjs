import test from "node:test";
import assert from "node:assert/strict";
import {
  getInternalPaymentStatusFromMercadoPago,
  getPaymentStatusLabel,
  getReadablePaymentDetail,
  isProductLockedByOrderStatus,
  isSaleDispatchable,
  mergeMercadoPagoPaymentDetail,
} from "../src/lib/paymentStatus.js";

test("detecta reembolso pendiente desde refunds en procesamiento", () => {
  assert.equal(
    getInternalPaymentStatusFromMercadoPago({
      status: "approved",
      status_detail: "accredited",
      refunds: [{ status: "processing" }],
    }),
    "refund_pending",
  );
});

test("detecta reembolso parcial desde status_detail", () => {
  assert.equal(
    getInternalPaymentStatusFromMercadoPago({
      status: "approved",
      status_detail: "partially_refunded",
    }),
    "partially_refunded",
  );
});

test("detecta reembolso total desde status_detail", () => {
  assert.equal(
    getInternalPaymentStatusFromMercadoPago({
      status: "approved",
      status_detail: "refunded",
    }),
    "refunded",
  );
});

test("reembolsos pendientes bloquean producto pero no despacho", () => {
  assert.equal(isProductLockedByOrderStatus("refund_pending"), true);
  assert.equal(isSaleDispatchable("refund_pending"), false);
  assert.equal(getPaymentStatusLabel("refund_pending"), "Reembolso pendiente");
});

test("conserva la traza de split al registrar el detalle de Mercado Pago", () => {
  assert.equal(
    mergeMercadoPagoPaymentDetail(
      "mp_preference|marketplace_fee:1|marketplace:omitted|oauth_seller:257559702",
      "accredited",
    ),
    "mp_preference|marketplace_fee:1|marketplace:omitted|oauth_seller:257559702|mp_status_detail:accredited",
  );
});

test("muestra un detalle legible sin exponer toda la traza tecnica", () => {
  assert.equal(
    getReadablePaymentDetail(
      "mp_preference|marketplace_fee:1|marketplace:omitted|oauth_seller:257559702|mp_status_detail:accredited",
    ),
    "Acreditado · comisión marketplace enviada: $1",
  );
});
