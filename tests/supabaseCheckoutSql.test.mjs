import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sqlFiles = [
  new URL("../docs/supabase-product-stock-publications.sql", import.meta.url),
  new URL("../docs/supabase-checkout-ordinality-hotfix.sql", import.meta.url),
];

test("la RPC atomica usa ROWS FROM para combinar recordset y ordinality", async () => {
  for (const file of sqlFiles) {
    const sql = await readFile(file, "utf8");
    assert.doesNotMatch(
      sql,
      /jsonb_to_recordset\s*\([^)]*\)\s+with\s+ordinality\s+as\s+requested\s*\([^)]*\b(?:uuid|integer|numeric|text|bigint)\b/is,
    );
    assert.match(
      sql,
      /from\s+rows\s+from\s*\(\s*jsonb_to_recordset\s*\([^)]*\)\s+as\s*\([^)]*\)\s*\)\s+with\s+ordinality\s+as\s+requested/is,
    );
  }
});

test("el cron cancela checkouts vencidos sin borrar su trazabilidad", async () => {
  const sql = await readFile(
    new URL("../docs/supabase-abandoned-checkouts-cron.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /status\s*=\s*'cancelled'/i);
  assert.match(sql, /payment_detail\s*=\s*'checkout_abandoned'/i);
  assert.match(sql, /payment_id\s+is\s+null/i);
  assert.match(sql, /cron\.schedule\s*\(/i);
  assert.match(sql, /'17 \* \* \* \*'/i);
  assert.match(sql, /create temporary table abandoned_checkout_cleanup_result/i);
  assert.doesNotMatch(sql, /with\s+cleanup\s+as\s*\(\s*select\s+public\.cancel_abandoned_checkout_orders/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.orders/i);
  assert.match(sql, /revoke all[\s\S]*authenticated/i);
});
