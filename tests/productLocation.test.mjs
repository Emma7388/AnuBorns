import test from "node:test";
import assert from "node:assert/strict";
import {
  formatProductLocation,
  productMatchesLocation,
} from "../src/lib/productLocation.js";

test("formatea la cobertura de todas las ciudades", () => {
  assert.equal(formatProductLocation("TODAS"), "Campana, Zárate, Lima");
  assert.equal(formatProductLocation("ZARATE"), "Zárate");
});

test("una publicación para todas aparece en cualquier filtro de ciudad", () => {
  assert.equal(productMatchesLocation("TODAS", "CAMPANA"), true);
  assert.equal(productMatchesLocation("TODAS", "ZARATE"), true);
  assert.equal(productMatchesLocation("TODAS", "LIMA"), true);
  assert.equal(productMatchesLocation("todas", "campana"), true);
  assert.equal(productMatchesLocation("CAMPANA", "CAMPANA"), true);
  assert.equal(productMatchesLocation("CAMPANA", "LIMA"), false);
  assert.equal(productMatchesLocation("CAMPANA", ""), true);
});
