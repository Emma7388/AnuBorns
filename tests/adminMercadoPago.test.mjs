import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminMercadoPagoSnapshot } from "../src/lib/adminMercadoPago.js";

const now = Date.parse("2026-10-15T20:00:00.000Z");
const seller = {
  user_id: "seller-1",
  label: "Nirvana Molina",
  email: "nirvana@example.com",
  products_count: 2,
  sales_count: 3,
  profile: { first_name: "Nirvana", last_name: "Molina", dni: "12345678" },
  auth_user: { email: "nirvana@example.com" },
};
const activeAccount = {
  user_id: "seller-1",
  mp_user_id: "3527785006",
  has_access_token: true,
  has_refresh_token: true,
  expires_at: "2026-10-16T20:00:00.000Z",
};

test("resume conexiones locales sin afirmar estados externos", () => {
  const snapshot = buildAdminMercadoPagoSnapshot({
    now,
    sellers: [seller],
    accounts: [activeAccount],
    pendingOrders: [{
      seller_user_id: "seller-1",
      order_id: "order-1",
      preference_id: "pref-1",
      total_amount: 500,
      currency: "ARS",
      products: [{ name: "Producto", qty: 1 }],
    }],
  });

  assert.equal(snapshot.verification_mode, "local");
  assert.equal(snapshot.summary.connected, 1);
  assert.equal(snapshot.summary.local_pending_attempts, 1);
  assert.equal(snapshot.summary.mercadopago_pending, 0);
  assert.equal(snapshot.sellers[0].pending_orders[0].kind, "preference_unverified");
  assert.equal(snapshot.sellers[0].identity.status, "not_verified");
});

test("distingue token vencido renovable de una reconexión obligatoria", () => {
  const snapshot = buildAdminMercadoPagoSnapshot({
    now,
    sellers: [seller, { ...seller, user_id: "seller-2", label: "Dos" }],
    accounts: [
      { ...activeAccount, expires_at: "2026-10-14T20:00:00.000Z" },
      { ...activeAccount, user_id: "seller-2", expires_at: "2026-10-14T20:00:00.000Z", has_refresh_token: false },
    ],
  });

  assert.equal(snapshot.sellers.find((row) => row.user_id === "seller-1").connection.state, "expired_refreshable");
  assert.equal(snapshot.sellers.find((row) => row.user_id === "seller-2").connection.state, "reconnect_required");
  assert.equal(snapshot.summary.connected, 1);
  assert.equal(snapshot.summary.reconnect_required, 1);
  assert.equal(snapshot.summary.critical, 1);
});

test("clasifica preferencia sin pago, pago pendiente real y estado ya resuelto", () => {
  const orders = ["empty", "pending", "resolved"].map((id) => ({
    seller_user_id: "seller-1",
    order_id: id,
    preference_id: `pref-${id}`,
    total_amount: 500,
    currency: "ARS",
  }));
  const snapshot = buildAdminMercadoPagoSnapshot({
    now,
    verificationMode: "live",
    sellers: [seller],
    accounts: [activeAccount],
    pendingOrders: orders,
    liveIdentities: [{
      user_id: "seller-1",
      ok: true,
      account: {
        id: "3527785006",
        first_name: "Nirvana",
        last_name: "Molina",
        email: "nirvana@example.com",
        identification: { number: "12345678" },
      },
    }],
    paymentChecks: [
      { order_id: "empty", ok: true, payment: null },
      { order_id: "pending", ok: true, payment: { id: "pay-1", status: "in_process" } },
      { order_id: "resolved", ok: true, payment: { id: "pay-2", status: "approved" } },
    ],
  });

  const kinds = snapshot.sellers[0].pending_orders.map((order) => order.kind);
  assert.deepEqual(kinds, ["preference_only", "mercadopago_pending", "mercadopago_resolved"]);
  assert.equal(snapshot.summary.mercadopago_pending, 1);
  assert.ok(snapshot.sellers[0].issues.some((item) => item.code === "local_pending_resolved"));
});

test("expone coincidencia de identidad sin devolver datos sensibles del perfil", () => {
  const snapshot = buildAdminMercadoPagoSnapshot({
    now,
    verificationMode: "live",
    sellers: [seller],
    accounts: [activeAccount],
    liveIdentities: [{
      user_id: "seller-1",
      ok: true,
      account: {
        id: "3527785006",
        first_name: "Nirvana",
        last_name: "Molina",
        email: "nirvana@example.com",
        identification: { number: "12345678" },
      },
    }],
  });

  assert.equal(snapshot.sellers[0].identity.status, "match");
  assert.equal(JSON.stringify(snapshot).includes("12345678"), false);
});

test("conserva la excepción autorizada como estado explícito", () => {
  const snapshot = buildAdminMercadoPagoSnapshot({
    now,
    verificationMode: "live",
    sellers: [seller],
    accounts: [{ ...activeAccount, mp_user_id: "1157622469" }],
    liveIdentities: [{ user_id: "seller-1", ok: true, account: { id: "1157622469" } }],
  });

  assert.equal(snapshot.sellers[0].identity.status, "exception");
  assert.equal(snapshot.sellers[0].identity.exception, true);
  assert.equal(snapshot.sellers[0].issues.length, 0);
});

test("una caída externa queda como no verificable sin ocultar datos locales", () => {
  const snapshot = buildAdminMercadoPagoSnapshot({
    now,
    verificationMode: "live",
    sellers: [seller],
    accounts: [activeAccount],
    pendingOrders: [{ seller_user_id: "seller-1", order_id: "order-1", preference_id: "pref-1" }],
    liveIdentities: [{ user_id: "seller-1", ok: false, error: "mercadopago_unavailable" }],
    paymentChecks: [{ order_id: "order-1", ok: false, error: "mercadopago_unavailable" }],
  });

  assert.equal(snapshot.sellers[0].identity.status, "unavailable");
  assert.equal(snapshot.sellers[0].pending_orders[0].kind, "verification_unavailable");
  assert.equal(snapshot.sellers[0].connection.mp_user_id, "3527785006");
  assert.ok(snapshot.sellers[0].issues.some((item) => item.code === "payment_unavailable"));
});
