import test from "node:test";
import assert from "node:assert/strict";
import { getPendingSaleItems } from "../src/lib/salePendingAction.js";

const item = (status, shippingRequested = true) => ({
  salesHistory: [{ orderId: "order", soldAt: "2026-09-12", fulfillmentStatus: status, shippingRequested }],
});

test("sin ventas o con ventas completadas no hay aviso pendiente", () => {
  assert.deepEqual(getPendingSaleItems([]), []);
  assert.deepEqual(getPendingSaleItems([item("completed")]), []);
});

test("esperar al comprador no activa el aviso del vendedor", () => {
  assert.deepEqual(getPendingSaleItems([item("shipped"), item("ready_for_pickup", false)]), []);
});

test("incluye las acciones pendientes de envio, retiro y cierre", () => {
  for (const [status, shipping] of [["requested", true], ["preparing", true], ["delivered", true], ["pickup_pending", false], ["picked_up", false]]) {
    assert.equal(getPendingSaleItems([item(status, shipping)]).length, 1);
  }
});
