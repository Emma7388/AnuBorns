import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Vercel conserva los encabezados defensivos globales", async () => {
  const config = JSON.parse(await readProjectFile("vercel.json"));
  const globalRule = config.headers?.find((rule) => rule.source === "/(.*)");
  assert.ok(globalRule, "Falta la regla global de encabezados");

  const headers = new Map(globalRule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(headers.get("permissions-policy") ?? "", /camera=\(\)/);
  assert.match(headers.get("permissions-policy") ?? "", /microphone=\(\)/);
  assert.match(headers.get("permissions-policy") ?? "", /geolocation=\(\)/);
});

test("la navegación administrativa evita reutilizar módulos ligados a un DOM anterior", async () => {
  const files = [
    "src/components/Header.astro",
    "src/pages/admin/index.astro",
    "src/pages/admin/administracion.astro",
    "src/pages/admin/mercadopago.astro",
    "src/pages/admin/operaciones.astro",
    "src/pages/admin/usuarios.astro",
  ];

  let linkCount = 0;
  for (const file of files) {
    const source = await readProjectFile(file);
    const links = [...source.matchAll(/<a\b[^>]*href="\/admin[^"]*"[^>]*>/g)];
    linkCount += links.length;
    links.forEach(([link]) => {
      assert.match(link, /\bdata-astro-reload\b/, `${file} contiene un enlace admin sin recarga segura`);
    });
  }

  assert.ok(linkCount > 0, "No se encontraron enlaces administrativos para auditar");
  const layout = await readProjectFile("src/layouts/MainLayout.astro");
  assert.match(layout, /footerBack\.toggleAttribute\("data-astro-reload", requiresFullReload\)/);
});
