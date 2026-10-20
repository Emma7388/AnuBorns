import assert from "node:assert/strict";
import test from "node:test";
import {
  isForbiddenEnvironmentFile,
  scanTextForSecrets,
} from "../scripts/audit-repository-secrets.mjs";

test("rechaza archivos de entorno reales pero permite el ejemplo", () => {
  assert.equal(isForbiddenEnvironmentFile(".env"), true);
  assert.equal(isForbiddenEnvironmentFile(".env.local"), true);
  assert.equal(isForbiddenEnvironmentFile("config/.env.production"), true);
  assert.equal(isForbiddenEnvironmentFile(".env.example"), false);
});

test("detecta credenciales reconocibles sin devolver su valor", () => {
  const fakeToken = `APP_USR-${"A".repeat(24)}`;
  const findings = scanTextForSecrets(`MERCADOPAGO_ACCESS_TOKEN=${fakeToken}`);
  assert.deepEqual(findings, [{ rule: "mercadopago-access-token", line: 1 }]);
  assert.doesNotMatch(JSON.stringify(findings), /APP_USR-/);
});

test("detecta un JWT service_role y no confunde otros roles", () => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const serviceRole = `${encode({ alg: "HS256" })}.${encode({ role: "service_role" })}.firmafalsa`;
  const anonRole = `${encode({ alg: "HS256" })}.${encode({ role: "anon" })}.firmafalsa`;

  assert.deepEqual(scanTextForSecrets(serviceRole), [
    { rule: "supabase-service-role-jwt", line: 1 },
  ]);
  assert.deepEqual(scanTextForSecrets(anonRole), []);
});

test("tolera placeholders y documentación sin credenciales", () => {
  assert.deepEqual(scanTextForSecrets("MERCADOPAGO_ACCESS_TOKEN=tu_token_aqui"), []);
  assert.deepEqual(scanTextForSecrets("SUPABASE_SERVICE_ROLE_KEY=solo_backend"), []);
});
