import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("la migracion limita acceso y usa una RPC atomica", async () => {
  const sql = await readFile(path.join(root, "docs", "supabase-distributed-rate-limit.sql"), "utf8");

  assert.match(sql, /create table if not exists public\.api_rate_limits/i);
  assert.match(sql, /alter table public\.api_rate_limits enable row level security/i);
  assert.match(sql, /create or replace function public\.consume_api_rate_limit/i);
  assert.match(sql, /on conflict \(key_hash\) do update/i);
  assert.match(sql, /security definer\s+set search_path = pg_catalog/i);
  assert.match(sql, /revoke all on function public\.consume_api_rate_limit[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.consume_api_rate_limit[\s\S]*to service_role/i);
  assert.match(sql, /anuborns_cleanup_api_rate_limits/i);
});

test("todos los endpoints esperan el resultado del limitador distribuido", async () => {
  const apiRoot = path.join(root, "src", "pages", "api");
  const entries = await readdir(apiRoot, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join(entry.parentPath, entry.name));

  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/const rate = checkRateLimit\(/.test(source)) offenders.push(path.relative(root, file));
  }

  assert.deepEqual(offenders, []);
});
