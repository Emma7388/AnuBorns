import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  buildRateLimitKeyHash,
  checkRateLimit,
  resetRateLimitStateForTests,
} from "../src/lib/serverRateLimit.js";

const requestFromIp = (ip) => new Request("https://anuborns.test/api/test", {
  headers: { "x-forwarded-for": ip },
});

afterEach(() => {
  resetRateLimitStateForTests();
  delete process.env.RATE_LIMIT_HASH_SECRET;
});

test("genera una clave opaca y estable sin guardar la IP", () => {
  const request = requestFromIp("203.0.113.25");
  const first = buildRateLimitKeyHash({ request, routeKey: "checkout", secret: "test-secret" });
  const repeated = buildRateLimitKeyHash({ request, routeKey: "checkout", secret: "test-secret" });
  const anotherRoute = buildRateLimitKeyHash({ request, routeKey: "products", secret: "test-secret" });

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, repeated);
  assert.notEqual(first, anotherRoute);
  assert.equal(first.includes("203.0.113.25"), false);
});

test("consume la RPC compartida con parametros acotados", async () => {
  process.env.RATE_LIMIT_HASH_SECRET = "test-secret";
  let call;
  const adminClient = {
    async rpc(name, params) {
      call = { name, params };
      return {
        data: [{ allowed: true, remaining: 4, retry_after_seconds: 0 }],
        error: null,
      };
    },
  };

  const result = await checkRateLimit({
    request: requestFromIp("203.0.113.25"),
    routeKey: "checkout",
    windowMs: 60_000,
    max: 5,
    adminClient,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 4);
  assert.equal(result.source, "distributed");
  assert.equal(call.name, "consume_api_rate_limit");
  assert.equal(call.params.p_limit, 5);
  assert.equal(call.params.p_window_seconds, 60);
  assert.match(call.params.p_key_hash, /^[0-9a-f]{64}$/);
});

test("respeta el bloqueo devuelto por el contador distribuido", async () => {
  const adminClient = {
    async rpc() {
      return {
        data: [{ allowed: false, remaining: 0, retry_after_seconds: 17 }],
        error: null,
      };
    },
  };

  const result = await checkRateLimit({
    request: requestFromIp("203.0.113.25"),
    routeKey: "checkout",
    max: 1,
    adminClient,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.retryAfterSeconds, 17);
  assert.equal(result.source, "distributed");
});

test("mantiene proteccion local si la RPC no esta disponible", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  const adminClient = {
    async rpc() {
      return { data: null, error: { code: "PGRST202" } };
    },
  };

  try {
    const request = requestFromIp("203.0.113.30");
    const first = await checkRateLimit({
      request,
      routeKey: "checkout",
      windowMs: 60_000,
      max: 2,
      adminClient,
      currentNow: 100_000,
    });
    const second = await checkRateLimit({
      request,
      routeKey: "checkout",
      windowMs: 60_000,
      max: 2,
      adminClient,
      currentNow: 101_000,
    });
    const blocked = await checkRateLimit({
      request,
      routeKey: "checkout",
      windowMs: 60_000,
      max: 2,
      adminClient,
      currentNow: 102_000,
    });

    assert.equal(first.source, "memory-fallback");
    assert.equal(second.allowed, true);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 58);
  } finally {
    console.warn = originalWarn;
  }
});
