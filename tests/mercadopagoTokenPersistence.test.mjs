import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const tokenReaders = [
  "src/pages/api/checkout.js",
  "src/pages/api/mercadopago-webhook.js",
  "src/pages/api/mercadopago-payment-sync.js",
  "src/pages/api/mercadopago/pending-payments.js",
  "src/pages/api/mercadopago/oauth/status.js",
  "src/pages/api/admin/mercadopago.js",
  "src/pages/api/admin/users/[userId]/overview.js",
  "src/lib/mercadopagoIdentity.js",
];

test("cada flujo que usa tokens OAuth importa la capa criptográfica", async () => {
  for (const file of tokenReaders) {
    const source = await readFile(path.join(root, file), "utf8");
    assert.match(source, /mercadopagoTokenCrypto\.js/, `${file} debe descifrar exclusivamente en servidor`);
  }
});

test("altas y renovaciones nunca persisten el token plano recibido", async () => {
  const [callback, checkout] = await Promise.all([
    readFile(path.join(root, "src/pages/api/mp-oauth.js"), "utf8"),
    readFile(path.join(root, "src/pages/api/checkout.js"), "utf8"),
  ]);

  assert.match(callback, /encryptMercadoPagoAccountTokens\(payload\)/);
  assert.match(callback, /access_token:\s*encryptedTokens\.access_token/);
  assert.match(checkout, /encryptMercadoPagoAccountTokens\(refreshedAccount\)/);
  assert.match(checkout, /access_token:\s*encryptedTokens\.access_token/);
});

test("la migración OAuth exige admin, rate limit y auditoría", async () => {
  const source = await readFile(path.join(root, "src/pages/api/admin/mercadopago-token-encryption.js"), "utf8");
  assert.match(source, /requireAdmin/);
  assert.match(source, /checkRateLimit/);
  assert.match(source, /writeAdminAudit/);
  assert.match(source, /isEncryptedMercadoPagoToken/);
});
