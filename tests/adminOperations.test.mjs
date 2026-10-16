import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminOperationsSnapshot } from "../src/lib/adminOperations.js";

const now = Date.parse("2026-10-15T18:00:00.000Z");

test("clasifica estados globales sin convertir operaciones sanas en alertas", () => {
  const snapshot = buildAdminOperationsSnapshot({
    now,
    orders: [{
      id: "order-ok",
      created_at: "2026-10-15T17:00:00.000Z",
      status: "approved",
      payment_status: "approved",
      payment_id: "pay-1",
      payment_detail: "mp_preference|mp_status_detail:accredited",
      order_items: [{ product_id: "product-1", name: "Producto", qty: 1 }],
    }],
    auditLogs: [{ event: "order_payment_status_changed", metadata: { order_id: "order-ok" } }],
  });

  assert.equal(snapshot.summary.total_orders, 1);
  assert.equal(snapshot.summary.approved, 1);
  assert.equal(snapshot.summary.alerts, 0);
});

test("detecta pendientes antiguas y aprobaciones incompletas", () => {
  const snapshot = buildAdminOperationsSnapshot({
    now,
    orders: [
      { id: "old", created_at: "2026-10-13T17:00:00.000Z", status: "pending", order_items: [] },
      { id: "broken", created_at: "2026-10-15T17:00:00.000Z", status: "approved", payment_status: "approved", order_items: [] },
    ],
  });

  assert.deepEqual(snapshot.orders[0].anomalies.map((item) => item.code), ["stale_pending"]);
  assert.deepEqual(snapshot.orders[1].anomalies.map((item) => item.code), [
    "approved_without_payment_id",
    "payment_detail_missing",
    "approved_without_audit",
  ]);
  assert.equal(snapshot.summary.critical, 1);
});

test("detecta estados contradictorios y seguimiento faltante después de 24 horas", () => {
  const snapshot = buildAdminOperationsSnapshot({
    now,
    orders: [{
      id: "order-2",
      created_at: "2026-10-13T17:00:00.000Z",
      status: "approved",
      payment_status: "pending",
      payment_id: "pay-2",
      payment_detail: "accredited",
      order_items: [{ product_id: "product-2", name: "Dos", qty: 1 }],
    }],
  });

  assert.ok(snapshot.orders[0].anomalies.some((item) => item.code === "payment_state_mismatch"));
  assert.equal(snapshot.orders[0].state, "pending");
});

test("señala seguimiento faltante sólo para ventas aprobadas antiguas", () => {
  const baseOrder = {
    id: "order-3",
    status: "approved",
    payment_status: "approved",
    payment_id: "pay-3",
    payment_detail: "accredited",
    order_items: [{ product_id: "product-3", name: "Tres", qty: 1 }],
  };
  const auditLogs = [{ event: "order_payment_status_changed", metadata: { order_id: "order-3" } }];
  const recent = buildAdminOperationsSnapshot({
    now,
    orders: [{ ...baseOrder, created_at: "2026-10-15T17:00:00.000Z" }],
    auditLogs,
  });
  const old = buildAdminOperationsSnapshot({
    now,
    orders: [{ ...baseOrder, created_at: "2026-10-13T17:00:00.000Z" }],
    auditLogs,
  });

  assert.equal(recent.summary.fulfillment_alerts, 0);
  assert.ok(old.orders[0].anomalies.some((item) => item.code === "missing_dispatch"));
});

test("detecta publicaciones activas inconsistentes sin alertar por el vencimiento esperado", () => {
  const snapshot = buildAdminOperationsSnapshot({
    now,
    products: [
      { id: "no-stock", title: "Sin stock", stock: 0, publication_status: "active", publication_type: "permanent" },
      { id: "expired", title: "Vencida", stock: 1, publication_status: "active", publication_type: "monthly", publication_expires_at: "2026-10-14T00:00:00.000Z" },
      { id: "no-expiry", title: "Sin fecha", stock: 1, publication_status: "active", publication_type: "monthly" },
    ],
  });

  assert.equal(snapshot.catalog_alerts.length, 2);
  assert.equal(snapshot.summary.catalog_alerts, 2);
  assert.equal(snapshot.catalog_alerts.some((row) => row.id === "expired"), false);
  assert.ok(snapshot.catalog_alerts.some((row) => row.anomalies[0].severity === "critical"));
});
