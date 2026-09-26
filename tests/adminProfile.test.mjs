import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProfileDiff,
  normalizeAdminReason,
  validateAdminProfileInput,
} from "../src/lib/adminProfile.js";

test("normaliza y acepta datos de perfil admin validos", () => {
  const result = validateAdminProfileInput({
    first_name: " Ana ",
    last_name: " Molina ",
    phone: "11 1234-5678",
    dni: "12.345.678",
    address: " Calle 123 ",
    city: " Buenos Aires ",
    province: " Buenos Aires ",
    postal_code: " c1000 ",
  });

  assert.equal(result.ok, true);
  assert.equal(result.profile.phone, "1112345678");
  assert.equal(result.profile.dni, "12345678");
  assert.equal(result.profile.postal_code, "C1000");
});

test("rechaza perfil admin incompleto", () => {
  const result = validateAdminProfileInput({
    first_name: "A",
    last_name: "",
    phone: "123",
    dni: "1",
    address: "",
    city: "",
    province: "",
    postal_code: "",
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 1);
});

test("arma diff solo con campos cambiados", () => {
  const diff = buildProfileDiff(
    { first_name: "Ana", last_name: "Molina", phone: "111" },
    { first_name: "Ana", last_name: "Perez", phone: "111" },
  );

  assert.deepEqual(diff, {
    last_name: { before: "Molina", after: "Perez" },
  });
});

test("normaliza motivo admin", () => {
  assert.equal(normalizeAdminReason("  correccion   pedida\npor usuario  "), "correccion pedida por usuario");
});
