import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  evaluateMercadoPagoDiagnosticsConfig,
  evaluateMarketplaceConfig,
  evaluateSiteUrl,
  summarizeHealth,
} from "../src/lib/adminHealth.js";

const ENV_KEYS = [
  "SITE_URL",
  "MERCADOPAGO_MARKETPLACE_FEE_AMOUNT",
  "MERCADOPAGO_MARKETPLACE_FEE_PERCENT",
  "MERCADOPAGO_SEND_MARKETPLACE_FIELD",
  "MERCADOPAGO_MARKETPLACE_ID",
  "MERCADOPAGO_DIAGNOSTIC_MODE",
  "MERCADOPAGO_DIAGNOSTIC_ALLOWED_SELLER_USER_IDS",
  "MERCADOPAGO_DIAGNOSTIC_ALLOWED_MP_USER_IDS",
  "VERCEL_ENV",
];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

test("marca OK cuando hay marketplace_fee y marketplace queda omitido", () => {
  process.env.MERCADOPAGO_MARKETPLACE_FEE_AMOUNT = "1";
  process.env.MERCADOPAGO_SEND_MARKETPLACE_FIELD = "false";

  const check = evaluateMarketplaceConfig();

  assert.equal(check.status, "ok");
  assert.match(check.detail, /marketplace_fee/);
});

test("marca revisar si se habilita el campo marketplace con id configurado", () => {
  process.env.MERCADOPAGO_MARKETPLACE_FEE_AMOUNT = "1";
  process.env.MERCADOPAGO_SEND_MARKETPLACE_FIELD = "true";
  process.env.MERCADOPAGO_MARKETPLACE_ID = "MP";

  const check = evaluateMarketplaceConfig();

  assert.equal(check.status, "warning");
  assert.match(check.action, /Confirmar con Mercado Pago/);
});

test("marca error si se habilita marketplace sin marketplace id", () => {
  process.env.MERCADOPAGO_SEND_MARKETPLACE_FIELD = "true";

  const check = evaluateMarketplaceConfig();

  assert.equal(check.status, "error");
});

test("valida SITE_URL como HTTPS publico", () => {
  process.env.SITE_URL = "https://anuborns.example";

  const check = evaluateSiteUrl();

  assert.equal(check.status, "ok");
});

test("resume estado general con prioridad de errores", () => {
  const summary = summarizeHealth([
    { status: "ok" },
    { status: "warning" },
    { status: "error" },
  ]);

  assert.equal(summary.status, "error");
  assert.equal(summary.ok, 1);
  assert.equal(summary.warnings, 1);
  assert.equal(summary.errors, 1);
});

test("marca OK si los diagnosticos Mercado Pago estan apagados", () => {
  const check = evaluateMercadoPagoDiagnosticsConfig();

  assert.equal(check.status, "ok");
});

test("marca error si diagnostico Mercado Pago esta activo sin allowlist", () => {
  process.env.MERCADOPAGO_DIAGNOSTIC_MODE = "true";

  const check = evaluateMercadoPagoDiagnosticsConfig();

  assert.equal(check.status, "error");
});

test("marca revisar si diagnostico Mercado Pago esta activo en produccion", () => {
  process.env.MERCADOPAGO_DIAGNOSTIC_MODE = "true";
  process.env.MERCADOPAGO_DIAGNOSTIC_ALLOWED_SELLER_USER_IDS = "seller-test";
  process.env.VERCEL_ENV = "production";

  const check = evaluateMercadoPagoDiagnosticsConfig();

  assert.equal(check.status, "warning");
});
