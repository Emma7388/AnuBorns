import test from "node:test";
import assert from "node:assert/strict";
import { resolvePurchaseProvider, purchaseProviderGroupKey } from "../src/lib/purchaseProvider.js";

test("vendedores con el mismo nombre mantienen contactos y grupos separados", () => {
  const products = {
    a: { user_id: "seller-a", contact: "+54 111" },
    b: { user_id: "seller-b", contact: "+54 222" },
  };
  const a = { product_id: "a", provider: "Maria" };
  const b = { product_id: "b", provider: "Maria" };
  assert.equal(resolvePurchaseProvider(a, products).phone, "54111");
  assert.equal(resolvePurchaseProvider(b, products).phone, "54222");
  assert.notEqual(purchaseProviderGroupKey(a, products, 0), purchaseProviderGroupKey(b, products, 1));
});

test("no toma el contacto de un producto asociado a otro vendedor", () => {
  const item = { product_id: "a", provider_user_id: "original" };
  assert.equal(resolvePurchaseProvider(item, { a: { user_id: "otro", contact: "123" } }).phone, "");
});

test("conserva el contacto guardado al comprar aunque el producto no exista", () => {
  assert.equal(resolvePurchaseProvider({ provider_whatsapp: "+54 999", provider_user_id: "seller" }).phone, "54999");
});

test("sin producto ni contacto no adivina por nombre ni agrupa desconocidos", () => {
  const item = { provider: "Maria" };
  assert.equal(resolvePurchaseProvider(item).phone, "");
  assert.notEqual(purchaseProviderGroupKey(item, {}, 0), purchaseProviderGroupKey(item, {}, 1));
});

test("productos del mismo vendedor permanecen agrupados", () => {
  const a = { product_id: "a", provider_user_id: "seller" };
  const b = { product_id: "b", provider_user_id: "seller" };
  assert.equal(purchaseProviderGroupKey(a, {}, 0), purchaseProviderGroupKey(b, {}, 1));
});
