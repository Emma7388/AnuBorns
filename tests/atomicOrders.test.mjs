import assert from "node:assert/strict";
import test from "node:test";
import {
  createAtomicCheckoutOrder,
  isProductReservationConflictError,
} from "../src/lib/atomicOrders.js";

const checkout = {
  totalAmount: 115,
  orderCurrency: "ARS",
  shippingRequested: true,
  shippingCost: 15,
  serverItems: [
    {
      product_id: "11111111-1111-1111-1111-111111111111",
      qty: 9,
      unit_price: 100,
      currency: "ars",
      provider_user_id: "22222222-2222-2222-2222-222222222222",
    },
  ],
};

test("crea la orden por la RPC atomica con snapshots confiables", async () => {
  let call;
  const supabase = {
    async rpc(name, params) {
      call = { name, params };
      return { data: { ok: true, order: { id: "order-id", status: "pending" } }, error: null };
    },
  };

  const result = await createAtomicCheckoutOrder(supabase, {
    userId: "33333333-3333-3333-3333-333333333333",
    status: "pending",
    checkout,
    shipping: { fullName: "Comprador", address: "Calle 1", city: "Ciudad", phone: "123" },
    shippingStatus: "requested",
  });

  assert.equal(result.ok, true);
  assert.equal(result.order.id, "order-id");
  assert.equal(call.name, "create_checkout_order_atomic");
  assert.equal(call.params.p_items[0].qty, 1);
  assert.equal(call.params.p_items[0].currency, "ARS");
  assert.equal(call.params.p_total_amount, 115);
});

test("traduce una reserva ocupada a conflicto HTTP", async () => {
  const supabase = {
    async rpc() {
      return {
        data: {
          ok: false,
          code: "product_unavailable",
          sold_product_ids: ["11111111-1111-1111-1111-111111111111"],
        },
        error: null,
      };
    },
  };

  const result = await createAtomicCheckoutOrder(supabase, {
    userId: "33333333-3333-3333-3333-333333333333",
    status: "pending",
    checkout,
    shippingStatus: "requested",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.deepEqual(result.soldProductIds, ["11111111-1111-1111-1111-111111111111"]);
});

test("reconoce el conflicto final impuesto por el trigger", () => {
  assert.equal(
    isProductReservationConflictError({ code: "P0001", message: "product_unavailable" }),
    true,
  );
  assert.equal(isProductReservationConflictError({ message: "otro error" }), false);
});
