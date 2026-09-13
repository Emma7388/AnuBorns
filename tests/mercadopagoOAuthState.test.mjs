import test from "node:test";
import assert from "node:assert/strict";

const originalClientSecret = process.env.MERCADOPAGO_CLIENT_SECRET;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const restoreEnv = () => {
  if (originalClientSecret === undefined) {
    delete process.env.MERCADOPAGO_CLIENT_SECRET;
  } else {
    process.env.MERCADOPAGO_CLIENT_SECRET = originalClientSecret;
  }

  if (originalServiceRoleKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  }
};

test.after(restoreEnv);

test("no crea ni valida state OAuth sin secreto de firma", async () => {
  delete process.env.MERCADOPAGO_CLIENT_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const module = await import(`../src/lib/mercadopagoOAuthState.js?case=no-secret-${Date.now()}`);

  assert.equal(module.hasMercadoPagoOAuthStateSecret(), false);
  assert.throws(() => module.createMercadoPagoOAuthState("user-1"), /Missing Mercado Pago OAuth state secret/);
  assert.equal(module.verifyMercadoPagoOAuthState("abc.def").ok, false);
});

test("valida states firmados y rechaza manipulaciones", async () => {
  process.env.MERCADOPAGO_CLIENT_SECRET = "test-secret";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const module = await import(`../src/lib/mercadopagoOAuthState.js?case=secret-${Date.now()}`);

  const state = module.createMercadoPagoOAuthState("user-1");
  assert.deepEqual(module.verifyMercadoPagoOAuthState(state), { ok: true, userId: "user-1" });

  const [payload, signature] = state.split(".");
  const tamperedPayload = Buffer.from(JSON.stringify({ userId: "user-2", iat: Date.now() })).toString("base64url");
  assert.equal(module.verifyMercadoPagoOAuthState(`${tamperedPayload}.${signature}`).ok, false);
  assert.equal(module.verifyMercadoPagoOAuthState(`${payload}.bad-signature`).ok, false);
});
