import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const sqlFiles = [
  "supabase-storage.sql",
  "supabase-product-images-storage-hardening.sql",
];

for (const file of sqlFiles) {
  test(`${file} restringe tamaño, MIME, extensión y carpeta propietaria`, async () => {
    const sql = await readFile(path.join(root, "docs", file), "utf8");

    assert.match(sql, /20\s*\*\s*1024\s*\*\s*1024/i);
    assert.match(sql, /allowed_mime_types/i);
    assert.match(sql, /image\/jpeg/i);
    assert.match(sql, /image\/png/i);
    assert.match(sql, /image\/webp/i);
    assert.match(sql, /storage\.foldername\(name\)/i);
    assert.match(sql, /auth\.uid\(\)::text/i);
    assert.match(sql, /storage\.extension\(name\)[\s\S]*'jpg'[\s\S]*'jpeg'[\s\S]*'png'[\s\S]*'webp'/i);
    assert.match(sql, /owner_id\s*=\s*\(select\s+auth\.uid\(\)::text\)/i);
    assert.doesNotMatch(sql, /auth\.uid\(\)\s*=\s*owner\b/i);
  });
}

test("la migración incremental no modifica ni elimina objetos existentes", async () => {
  const sql = await readFile(
    path.join(root, "docs", "supabase-product-images-storage-hardening.sql"),
    "utf8",
  );
  const executable = sql.replace(/--.*$/gm, "");

  assert.doesNotMatch(executable, /delete\s+from\s+storage\.objects/i);
  assert.doesNotMatch(executable, /update\s+storage\.objects/i);
  assert.match(sql, /unexpected_extension/i);
  assert.match(sql, /unexpected_path_depth/i);
});
