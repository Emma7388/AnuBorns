import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildVercelAnalyticsSnapshot,
  normalizeVercelAnalyticsCount,
  normalizeVercelAnalyticsRows,
} from "../src/lib/vercelAnalytics.js";

test("normaliza conteos desde respuestas anidadas", () => {
  const count = normalizeVercelAnalyticsCount({
    data: {
      visitors: "12",
      pageviews: 34,
    },
  });

  assert.deepEqual(count, {
    visitors: 12,
    pageviews: 34,
  });
});

test("normaliza filas agregadas y las ordena por trafico", () => {
  const rows = normalizeVercelAnalyticsRows({
    data: [
      { requestPath: "/producto/demo", pageviews: 5, visitors: 3 },
      { requestPath: "/", pageviews: 20, visitors: 8 },
    ],
  }, "requestPath");

  assert.equal(rows[0].label, "/");
  assert.equal(rows[0].pageviews, 20);
  assert.equal(rows[1].label, "/producto/demo");
});

test("construye snapshot de analytics con tarjetas y rankings", () => {
  const snapshot = buildVercelAnalyticsSnapshot({
    count7d: { data: { visitors: 7, pageviews: 21 } },
    count30d: { data: { visitors: 18, pageviews: 72 } },
    pages: {
      data: [
        { requestPath: "/", pageviews: 50, visitors: 14 },
        { requestPath: "/comprar/productos", pageviews: 22, visitors: 9 },
      ],
    },
    referrers: { data: [{ referrerHostname: "google.com", pageviews: 11, visitors: 6 }] },
    countries: { data: [{ country: "AR", pageviews: 60, visitors: 16 }] },
    devices: { data: [{ deviceType: "mobile", pageviews: 44, visitors: 12 }] },
    generatedAt: "2026-09-27T12:00:00.000Z",
  });

  assert.equal(snapshot.configured, true);
  assert.equal(snapshot.check.status, "ok");
  assert.equal(snapshot.items.find((item) => item.id === "vercel-visitors-7d").value_display, "7");
  assert.equal(snapshot.items.find((item) => item.id === "vercel-top-page").value_display, "/");
  assert.equal(snapshot.sections.find((section) => section.id === "top-referrers").rows[0].label, "google.com");
});
