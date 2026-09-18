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
