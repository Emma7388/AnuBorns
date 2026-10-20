import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const sourceRoot = path.join(root, "src");

const auditedSinks = {
  "lib/cartConfirm.js": { innerHTML: 1, documentWrite: 0 },
  "lib/cartToast.js": { innerHTML: 1, documentWrite: 0 },
  "scripts/admin-administracion.js": { innerHTML: 5, documentWrite: 0 },
  "scripts/admin-dashboard.js": { innerHTML: 11, documentWrite: 0 },
  "scripts/admin-mercadopago.js": { innerHTML: 1, documentWrite: 0 },
  "scripts/admin-operations.js": { innerHTML: 1, documentWrite: 0 },
  "scripts/admin-users.js": { innerHTML: 14, documentWrite: 0 },
  "scripts/cart.js": { innerHTML: 2, documentWrite: 0 },
  "scripts/checkout.js": { innerHTML: 3, documentWrite: 0 },
  "scripts/confirmation.js": { innerHTML: 0, documentWrite: 1 },
  "scripts/featured-products.js": { innerHTML: 5, documentWrite: 0 },
  "scripts/header-auth.js": { innerHTML: 1, documentWrite: 0 },
  "scripts/login.js": { innerHTML: 1, documentWrite: 0 },
  "scripts/mercadopago-connect.js": { innerHTML: 2, documentWrite: 0 },
  "scripts/mis-ventas.js": { innerHTML: 8, documentWrite: 1 },
  "scripts/orders.js": { innerHTML: 3, documentWrite: 1 },
  "scripts/product-create.js": { innerHTML: 4, documentWrite: 0 },
  "scripts/product-image-modal.js": { innerHTML: 1, documentWrite: 0 },
  "scripts/profile.js": { innerHTML: 2, documentWrite: 0 },
  "scripts/purchase-status-notifications.js": { innerHTML: 1, documentWrite: 0 },
};

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (entry.name.endsWith(".js")) files.push(target);
  }
  return files;
};

test("cada sink HTML dinámico requiere una revisión explícita", async () => {
  const actual = {};
  for (const file of await walk(sourceRoot)) {
    const source = await readFile(file, "utf8");
    const innerHTML = (source.match(/\binnerHTML\b/g) ?? []).length;
    const documentWrite = (source.match(/\bdocument\.write\s*\(/g) ?? []).length;
    if (!innerHTML && !documentWrite) continue;
    actual[path.relative(sourceRoot, file).replaceAll("\\", "/")] = { innerHTML, documentWrite };
  }

  assert.deepEqual(actual, auditedSinks);
});

test("las ventas no interpolan campos externos sin escapar en tarjetas o comprobantes", async () => {
  const source = await readFile(path.join(sourceRoot, "scripts", "mis-ventas.js"), "utf8");
  assert.doesNotMatch(source, /\$\{sale\.(?:title|image|currency)\}/);
  assert.doesNotMatch(source, /onclick\s*=/i);
  assert.match(source, /safeSaleTitle/);
  assert.match(source, /safeSaleImage/);
  assert.match(source, /safeSaleCurrency/);
});

test("los comprobantes de compra usan el generador que escapa contenido", async () => {
  const [confirmation, orders] = await Promise.all([
    readFile(path.join(sourceRoot, "scripts", "confirmation.js"), "utf8"),
    readFile(path.join(sourceRoot, "scripts", "orders.js"), "utf8"),
  ]);
  assert.match(confirmation, /document\.write\(buildPurchaseDetailHtml\(/);
  assert.match(orders, /document\.write\(buildPurchaseDetailHtml\(/);
});
