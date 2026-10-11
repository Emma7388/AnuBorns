import test from "node:test";
import assert from "node:assert/strict";
import {
  getSellerRecordedShippingCost,
  getSellerShippingDestination,
  isSellerShippingRequested,
} from "../src/lib/sellerShipping.js";

test("mantiene el envío nuevo aunque su costo sea cero", () => {
  const input = {
    shippingRequested: true,
    orderShippingCost: 0,
    shippingAddress: "María: Calle 1, Córdoba",
    shippingCity: "Por proveedor",
    providerName: "María",
  };
  assert.equal(isSellerShippingRequested(input), true);
  assert.equal(getSellerRecordedShippingCost(input), 0);
  assert.deepEqual(getSellerShippingDestination({
    shippingAddress: input.shippingAddress,
    shippingCity: "Por proveedor",
    providerName: input.providerName,
  }), { address: "Calle 1, Córdoba", city: "" });
});

test("no expone a otro vendedor una entrega agrupada", () => {
  const input = {
    shippingRequested: true,
    orderShippingCost: 0,
    shippingAddress: "María: Calle 1, Córdoba",
    shippingCity: "Por proveedor",
    providerName: "José",
  };
  assert.equal(isSellerShippingRequested(input), false);
  assert.equal(getSellerRecordedShippingCost(input), 0);
});

test("conserva dirección y costo de órdenes históricas sin formato por proveedor", () => {
  const input = {
    shippingRequested: true,
    orderShippingCost: 5000,
    shippingAddress: "Calle histórica 123",
    shippingCity: "Rosario",
    providerName: "María",
  };
  assert.equal(isSellerShippingRequested(input), true);
  assert.equal(getSellerRecordedShippingCost(input), 5000);
  assert.deepEqual(getSellerShippingDestination({
    shippingAddress: input.shippingAddress,
    shippingCity: "Rosario",
    providerName: input.providerName,
  }), { address: "Calle histórica 123", city: "Rosario" });
});
