import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptMercadoPagoAccount,
  decryptMercadoPagoToken,
  encryptMercadoPagoToken,
  getMercadoPagoTokenEncryptionStatus,
  isEncryptedMercadoPagoToken,
} from "../src/lib/mercadopagoTokenCrypto.js";

const originalKey = process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY;
const validKey = Buffer.alloc(32, 7).toString("base64url");

test.afterEach(() => {
  if (originalKey === undefined) delete process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY;
  else process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY = originalKey;
});

test("cifra tokens con AES-GCM y detecta cualquier manipulación", () => {
  process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY = validKey;
  const encrypted = encryptMercadoPagoToken("APP_USR-token-secreto");

  assert.equal(isEncryptedMercadoPagoToken(encrypted), true);
  assert.equal(encrypted.includes("APP_USR-token-secreto"), false);
  assert.equal(decryptMercadoPagoToken(encrypted), "APP_USR-token-secreto");
  assert.throws(() => decryptMercadoPagoToken(`${encrypted.slice(0, -1)}A`), /decryption_failed/);
});

test("conserva lectura temporal de tokens legados y descifra una cuenta completa", () => {
  process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY = validKey;
  const access = encryptMercadoPagoToken("access");
  const account = decryptMercadoPagoAccount({ access_token: access, refresh_token: "legacy-refresh" });

  assert.equal(account.access_token, "access");
  assert.equal(account.refresh_token, "legacy-refresh");
});

test("rechaza una clave ausente o que no tenga 256 bits", () => {
  delete process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY;
  assert.equal(getMercadoPagoTokenEncryptionStatus().valid, false);
  assert.throws(() => encryptMercadoPagoToken("token"), /key_missing/);

  process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY = "corta";
  assert.equal(getMercadoPagoTokenEncryptionStatus().valid, false);
  assert.throws(() => encryptMercadoPagoToken("token"), /key_invalid/);
});
