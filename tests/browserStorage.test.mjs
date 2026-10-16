import test from "node:test";
import assert from "node:assert/strict";
import {
  readStorageJson,
  readStorageValue,
  removeStorageValue,
  writeStorageJson,
  writeStorageValue,
} from "../src/lib/browserStorage.js";

const withWindow = (storage, callback) => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage, sessionStorage: storage };
  try {
    callback();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
};

test("lee, escribe y elimina valores sin propagar errores de storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };

  withWindow(storage, () => {
    assert.equal(writeStorageValue("clave", "valor"), true);
    assert.equal(readStorageValue("clave"), "valor");
    assert.equal(removeStorageValue("clave"), true);
    assert.equal(readStorageValue("clave", { fallback: "-" }), "-");
  });
});

test("tolera JSON corrupto y cuotas de almacenamiento agotadas", () => {
  const storage = {
    getItem: () => "{invalido",
    setItem: () => { throw new Error("quota"); },
    removeItem: () => { throw new Error("blocked"); },
  };

  withWindow(storage, () => {
    assert.deepEqual(readStorageJson("clave", { fallback: {} }), {});
    assert.equal(writeStorageJson("clave", { ok: true }), false);
    assert.equal(removeStorageValue("clave"), false);
  });
});

test("mantiene fallbacks durante render de servidor", () => {
  assert.equal(readStorageValue("clave", { fallback: "seguro" }), "seguro");
  assert.equal(writeStorageValue("clave", "valor"), false);
});
