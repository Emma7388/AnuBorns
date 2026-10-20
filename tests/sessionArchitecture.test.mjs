import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

const walk = async (directory) => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(target));
    else if (/\.(?:js|mjs|astro)$/.test(entry.name)) result.push(target);
  }
  return result;
};

test("Supabase Auth usa PKCE y no hay cookies de sesión creadas por la aplicación", async () => {
  const client = await readFile(path.join(root, "src", "lib", "supabaseClient.js"), "utf8");
  assert.match(client, /flowType:\s*"pkce"/);
  assert.match(client, /detectSessionInUrl:\s*true/);

  for (const file of await walk(path.join(root, "src"))) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /document\.cookie\b/, `${path.relative(root, file)} no debe crear cookies JS de sesión`);
  }
});
