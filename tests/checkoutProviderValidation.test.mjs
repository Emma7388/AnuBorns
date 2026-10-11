import test from "node:test";
import assert from "node:assert/strict";
import { buildCheckoutContext } from "../src/lib/checkoutServer.js";

const createSupabaseMock = ({ products = [], soldRows = [] } = {}) => ({
  from(table) {
    if (table === "order_items") {
      return {
        select() {
          return {
            in() {
              return {
                eq() {
                  return {
                    is() {
                      return {
                        async lt() {
                          return { data: [], error: null };
                        },
                      };
                    },
                  };
                },
                async in() {
                  return { data: soldRows, error: null };
                },
              };
            },
          };
        },
      };
    }

    if (table === "products") {
      return {
        select() {
          return {
            async in() {
              return { data: products, error: null };
            },
          };
        },
      };
    }

    throw new Error(`Unexpected table ${table}`);
  },
});

const product = (id, userId) => ({
  id,
  title: `Producto ${id}`,
  description: "",
  price: 100,
  currency: "ARS",
  seller_name: `Vendedor ${userId}`,
  contact: "",
  user_id: userId,
  image_url: "",
  delivery_methods: ["retiro"],
  stock: 10,
  publication_type: "permanent",
  publication_status: "active",
  publication_expires_at: null,
});

test("acepta checkout cuando todos los productos coinciden con el vendedor esperado", async () => {
  const result = await buildCheckoutContext(createSupabaseMock({
    products: [product("p1", "seller-a"), product("p2", "seller-a")],
  }), {
    rawItems: [{ product_id: "p1" }, { product_id: "p2" }],
    buyerId: "buyer",
    expectedProviderUserId: "seller-a",
  });

  assert.equal(result.ok, true);
  assert.equal(result.serverItems.length, 2);
});

test("rechaza checkout cuando un producto no pertenece al vendedor esperado", async () => {
  const result = await buildCheckoutContext(createSupabaseMock({
    products: [product("p1", "seller-a"), product("p2", "seller-b")],
  }), {
    rawItems: [{ product_id: "p1" }, { product_id: "p2" }],
    buyerId: "buyer",
    expectedProviderUserId: "seller-a",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.error, "La compra incluye productos de otro vendedor.");
});

test("conserva el envío solicitado sin cobrarlo ni sumarlo al total", async () => {
  const shippableProduct = {
    ...product("p1", "seller-a"),
    price: 1000,
    delivery_methods: ["retiro", "envio"],
  };
  const result = await buildCheckoutContext(createSupabaseMock({
    products: [shippableProduct],
  }), {
    rawItems: [{ product_id: "p1" }],
    buyerId: "buyer",
    expectedProviderUserId: "seller-a",
    shipping: {
      requested: true,
      cost: 5000,
      groups: [{
        provider_key: "id:seller-a",
        provider: "Vendedor seller-a",
        address: "Calle 1",
        city: "Ciudad",
      }],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.shippingRequested, true);
  assert.equal(result.shippingCost, 0);
  assert.equal(result.productSubtotal, 1000);
  assert.equal(result.totalAmount, 1000);
  assert.deepEqual(result.shippingProductIds, ["p1"]);
});

test("rechaza tratar como retiro una publicación exclusiva de envío", async () => {
  const result = await buildCheckoutContext(createSupabaseMock({
    products: [{ ...product("p1", "seller-a"), delivery_methods: ["envio"] }],
  }), {
    rawItems: [{ product_id: "p1" }],
    buyerId: "buyer",
    expectedProviderUserId: "seller-a",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.error, "Hay productos que requieren envio.");
});

test("un registro histórico con retiro y envío también requiere envío", async () => {
  const result = await buildCheckoutContext(createSupabaseMock({
    products: [{ ...product("p1", "seller-a"), delivery_methods: ["retiro", "envio"] }],
  }), {
    rawItems: [{ product_id: "p1" }],
    buyerId: "buyer",
    expectedProviderUserId: "seller-a",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Hay productos que requieren envio.");
});

test("acepta el envío obligatorio cuando incluye destino válido", async () => {
  const result = await buildCheckoutContext(createSupabaseMock({
    products: [{ ...product("p1", "seller-a"), delivery_methods: ["envio"] }],
  }), {
    rawItems: [{ product_id: "p1" }],
    buyerId: "buyer",
    expectedProviderUserId: "seller-a",
    shipping: {
      groups: [{
        provider_key: "id:seller-a",
        provider: "Vendedor seller-a",
        address: "Calle 1",
        city: "Ciudad",
      }],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.shippingRequested, true);
  assert.deepEqual(result.shippingProductIds, ["p1"]);
});

test("la comisión porcentual sólo toma publicaciones permanentes", async () => {
  const result = await buildCheckoutContext(createSupabaseMock({
    products: [
      { ...product("p1", "seller-a"), price: 500, publication_type: "permanent" },
      { ...product("p2", "seller-a"), price: 2000, publication_type: "monthly", publication_expires_at: "2026-11-01T00:00:00.000Z" },
    ],
  }), {
    rawItems: [{ product_id: "p1", qty: 2 }, { product_id: "p2", qty: 3 }],
    buyerId: "buyer",
    expectedProviderUserId: "seller-a",
  });

  assert.equal(result.ok, true);
  assert.equal(result.productSubtotal, 7000);
  assert.equal(result.commissionableSubtotal, 1000);
});
