import assert from "node:assert/strict";
import test from "node:test";

import {
  getCheckoutPreferenceExpiration,
  getPendingOrderTtlMinutes,
} from "../src/lib/checkoutPendingOrders.js";

test("la preferencia de Mercado Pago vence junto con el TTL local", () => {
  const start = Date.parse("2026-10-12T12:00:00.000Z");
  const expiration = getCheckoutPreferenceExpiration({
    now: start,
    ttlMinutes: 24 * 60,
  });

  assert.deepEqual(expiration, {
    expires: true,
    expiration_date_from: "2026-10-12T12:00:00.000Z",
    expiration_date_to: "2026-10-13T12:00:00.000Z",
  });
});

test("un TTL invalido vuelve al valor seguro de 24 horas", () => {
  const start = Date.parse("2026-10-12T12:00:00.000Z");
  const expiration = getCheckoutPreferenceExpiration({ now: start, ttlMinutes: 0 });

  assert.equal(
    Date.parse(expiration.expiration_date_to) - Date.parse(expiration.expiration_date_from),
    24 * 60 * 60 * 1000,
  );
});

test("la configuracion local conserva 24 horas como valor predeterminado", () => {
  const previousValue = process.env.CHECKOUT_PENDING_ORDER_TTL_MINUTES;
  delete process.env.CHECKOUT_PENDING_ORDER_TTL_MINUTES;
  try {
    assert.equal(getPendingOrderTtlMinutes(), 24 * 60);
  } finally {
    if (previousValue === undefined) {
      delete process.env.CHECKOUT_PENDING_ORDER_TTL_MINUTES;
    } else {
      process.env.CHECKOUT_PENDING_ORDER_TTL_MINUTES = previousValue;
    }
  }
});
