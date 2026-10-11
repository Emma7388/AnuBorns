import assert from "node:assert/strict";
import test from "node:test";
import {
  MONTHLY_RENEWAL_WINDOW_MS,
  formatPublicationRemaining,
  getMonthlyPublicationTiming,
} from "../src/lib/publicationTiming.js";

test("la renovación se habilita al entrar en los últimos siete días", () => {
  const now = Date.parse("2026-10-11T12:00:00.000Z");
  const beforeWindow = getMonthlyPublicationTiming({
    status: "active",
    expiresAt: new Date(now + MONTHLY_RENEWAL_WINDOW_MS + 1).toISOString(),
    now,
  });
  const atWindow = getMonthlyPublicationTiming({
    status: "active",
    expiresAt: new Date(now + MONTHLY_RENEWAL_WINDOW_MS).toISOString(),
    now,
  });

  assert.equal(beforeWindow.renewalAvailable, false);
  assert.equal(atWindow.renewalAvailable, true);
});

test("una publicación sin período activo permite su pago inicial", () => {
  const result = getMonthlyPublicationTiming({ status: "pending_payment", expiresAt: null });
  assert.equal(result.active, false);
  assert.equal(result.renewalAvailable, true);
});

test("el contador expresa días y horas sin modificar la fecha real", () => {
  const duration = (2 * 24 + 3) * 60 * 60 * 1000;
  assert.equal(formatPublicationRemaining(duration), "2 días y 3 horas");
  assert.equal(formatPublicationRemaining(25 * 60 * 60 * 1000), "1 día y 1 hora");
});
