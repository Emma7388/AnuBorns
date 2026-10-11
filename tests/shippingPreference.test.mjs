import test from "node:test";
import assert from "node:assert/strict";
import {
  itemRequiresShipping,
  itemSupportsPickup,
  itemSupportsShipping,
} from "../src/lib/shippingPreference.js";

const item = (deliveryMethods) => ({ product: { delivery_methods: deliveryMethods } });

test("una publicación exclusiva de envío no admite retiro", () => {
  assert.equal(itemRequiresShipping(item(["envio"])), true);
  assert.equal(itemSupportsShipping(item(["envio"])), true);
  assert.equal(itemSupportsPickup(item(["envio"])), false);
});

test("retiro sigue siendo la modalidad segura por defecto", () => {
  assert.equal(itemRequiresShipping(item(["retiro"])), false);
  assert.equal(itemSupportsShipping(item(["retiro"])), false);
  assert.equal(itemSupportsPickup(item(["retiro"])), true);
  assert.equal(itemSupportsPickup(item([])), true);
});

test("publicaciones históricas con ambas modalidades se normalizan a solo envío", () => {
  assert.equal(itemRequiresShipping(item(["retiro", "envio"])), true);
  assert.equal(itemSupportsShipping(item(["retiro", "envio"])), true);
  assert.equal(itemSupportsPickup(item(["retiro", "envio"])), false);
});
