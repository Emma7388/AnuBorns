import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeProductInput } from "../src/lib/productInput.js";

const validProduct = {
  title: "Producto",
  description: "Descripción",
  category_id: "category-id",
  price: 500,
  stock: 12,
  location: "CAMPANA",
  delivery_methods: ["retiro", "envio"],
  pickup_address: "No debe persistirse",
  publication_type: "monthly",
};

test("normaliza stock y deja una sola modalidad de entrega", () => {
  const result = sanitizeProductInput(validProduct);
  assert.equal(result.ok, true);
  assert.equal(result.data.stock, 12);
  assert.deepEqual(result.data.delivery_methods, ["envio"]);
  assert.equal(result.data.pickup_address, null);
});

test("rechaza stock fuera de 1 a 100", () => {
  const result = sanitizeProductInput({ ...validProduct, stock: 101 });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /stock/i);
});

test("la edición parcial no exige campos ausentes", () => {
  const result = sanitizeProductInput({ stock: 4 }, { partial: true });
  assert.deepEqual(result, { ok: true, errors: [], data: { stock: 4 } });
});

