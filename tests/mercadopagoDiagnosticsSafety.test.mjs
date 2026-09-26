import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMercadoPagoDiagnosticPermission,
  evaluateMercadoPagoDiagnosticPermission,
  getMercadoPagoDiagnosticsConfig,
} from "../src/lib/mercadopagoDiagnosticsSafety.js";

test("mantiene los diagnosticos Mercado Pago apagados por defecto", () => {
  const config = getMercadoPagoDiagnosticsConfig({});

  assert.equal(config.enabled, false);
  assert.deepEqual(config.allowedSellerUserIds, []);
  assert.deepEqual(config.allowedMpUserIds, []);
});

test("rechaza diagnosticos aunque haya cuenta si el modo no esta activo", () => {
  const permission = evaluateMercadoPagoDiagnosticPermission({
    sellerUserId: "seller-a",
    env: {
      MERCADOPAGO_DIAGNOSTIC_ALLOWED_SELLER_USER_IDS: "seller-a",
    },
  });

  assert.equal(permission.ok, false);
  assert.equal(permission.reason, "diagnostic_mode_disabled");
});

test("rechaza diagnosticos activos sin cuenta explicita", () => {
  const permission = evaluateMercadoPagoDiagnosticPermission({
    env: {
      MERCADOPAGO_DIAGNOSTIC_MODE: "true",
      MERCADOPAGO_DIAGNOSTIC_ALLOWED_SELLER_USER_IDS: "seller-a",
    },
  });

  assert.equal(permission.ok, false);
  assert.equal(permission.reason, "diagnostic_account_missing");
});

test("rechaza cuentas conectadas que no estan en allowlist", () => {
  const permission = evaluateMercadoPagoDiagnosticPermission({
    sellerUserId: "seller-real",
    mpUserId: "123",
    env: {
      MERCADOPAGO_DIAGNOSTIC_MODE: "true",
      MERCADOPAGO_DIAGNOSTIC_ALLOWED_SELLER_USER_IDS: "seller-test",
      MERCADOPAGO_DIAGNOSTIC_ALLOWED_MP_USER_IDS: "456",
    },
  });

  assert.equal(permission.ok, false);
  assert.equal(permission.reason, "diagnostic_account_not_allowed");
});

test("acepta solo cuentas explicitamente permitidas", () => {
  const permission = evaluateMercadoPagoDiagnosticPermission({
    sellerUserId: "seller-test",
    env: {
      MERCADOPAGO_DIAGNOSTIC_MODE: "true",
      MERCADOPAGO_DIAGNOSTIC_ALLOWED_SELLER_USER_IDS: "seller-test",
    },
  });

  assert.equal(permission.ok, true);
});

test("assertMercadoPagoDiagnosticPermission corta ejecuciones inseguras", () => {
  assert.throws(
    () =>
      assertMercadoPagoDiagnosticPermission({
        sellerUserId: "seller-real",
        env: { MERCADOPAGO_DIAGNOSTIC_MODE: "true" },
      }),
    /allowlist/,
  );
});
