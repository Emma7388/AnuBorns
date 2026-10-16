import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanText,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  shortId,
} from "../src/lib/displayFormat.js";

test("escapa HTML sin alterar el contenido visible", () => {
  assert.equal(cleanText("  Producto  "), "Producto");
  assert.equal(escapeHtml(`<script data-x="1">'&'</script>`), "&lt;script data-x=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/script&gt;");
});

test("formatea fechas válidas y conserva un fallback para datos inválidos", () => {
  assert.equal(formatDateTime("fecha-invalida", { fallback: "Sin dato" }), "Sin dato");
  assert.notEqual(formatDateTime("2026-10-16T12:00:00.000Z"), "-");
});

test("formatea moneda con límites seguros y tolera códigos inválidos", () => {
  assert.equal(formatCurrency("no-numero", { fallback: "-" }), "-");
  assert.match(formatCurrency(1500, { currency: "código-inválido", maximumFractionDigits: 0 }), /1[\.\s]?500/);
});

test("crea referencias cortas consistentes", () => {
  assert.equal(shortId(" c3ade956-bac9 "), "C3ADE956");
  assert.equal(shortId(""), "SIN ID");
});
