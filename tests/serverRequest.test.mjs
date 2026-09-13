import test from "node:test";
import assert from "node:assert/strict";
import { readJsonBody } from "../src/lib/serverRequest.js";

test("lee JSON valido dentro del limite", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    body: JSON.stringify({ ok: true }),
    headers: { "content-type": "application/json" },
  });

  const result = await readJsonBody(request, { maxBytes: 100 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { ok: true });
});

test("rechaza payloads demasiado grandes antes de parsear", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    body: JSON.stringify({ text: "abcdef" }),
    headers: { "content-length": "1024" },
  });

  const result = await readJsonBody(request, { maxBytes: 10 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 413);
});

test("devuelve error controlado si el JSON es invalido", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    body: "{mal",
  });

  const result = await readJsonBody(request);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});
