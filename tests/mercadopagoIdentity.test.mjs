import assert from "node:assert/strict";
import test from "node:test";
import { compareMercadoPagoIdentity } from "../src/lib/mercadopagoIdentity.js";

test("compara nombre, email y DNI tolerando formato", () => {
  const result = compareMercadoPagoIdentity({
    mpAccount: { id: "22", first_name: "María", last_name: "Pérez", email: "MA@example.com", identification: { number: "12.345.678" } },
    profile: { first_name: "Maria", last_name: "Perez", dni: "12345678" },
    authUser: { email: "ma@example.com" },
  });
  assert.equal(result.matches, true);
});

test("informa exactamente los datos que no coinciden", () => {
  const result = compareMercadoPagoIdentity({
    mpAccount: { id: "22", first_name: "Otra", last_name: "Persona", email: "otra@example.com" },
    profile: { first_name: "Maria", last_name: "Perez", dni: "123" },
    authUser: { email: "ma@example.com" },
  });
  assert.deepEqual(result.mismatches, ["nombre y apellido", "email"]);
});

test("la cuenta 1157622469 conserva la excepción solicitada", () => {
  const result = compareMercadoPagoIdentity({ mpAccount: { id: "1157622469" } });
  assert.equal(result.matches, true);
  assert.equal(result.exception, true);
});
