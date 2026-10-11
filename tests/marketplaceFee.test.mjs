import test from "node:test";
import assert from "node:assert/strict";
import { calculateMarketplaceFee } from "../src/lib/marketplaceFee.js";

test("calcula el 1,5 por ciento sobre el subtotal de productos", () => {
  assert.equal(calculateMarketplaceFee(10_000, { percent: 1.5 }), 150);
});

test("un importe logístico externo no forma parte de la entrada de comisión", () => {
  const productSubtotal = 10_000;
  const externalShippingCost = 5_000;
  assert.equal(calculateMarketplaceFee(productSubtotal, { percent: 1.5 }), 150);
  assert.notEqual(
    calculateMarketplaceFee(productSubtotal, { percent: 1.5 }),
    Math.round((productSubtotal + externalShippingCost) * 0.015),
  );
});

test("el importe fijo conserva precedencia y nunca supera el subtotal", () => {
  assert.equal(calculateMarketplaceFee(1_000, { fixedAmount: 100, percent: 1.5 }), 100);
  assert.equal(calculateMarketplaceFee(50, { fixedAmount: 100 }), 50);
});
