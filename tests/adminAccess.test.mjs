import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAdminAccessRequest } from "../src/lib/adminAccess.js";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const targetUserId = "22222222-2222-4222-8222-222222222222";

const validate = (overrides = {}) => validateAdminAccessRequest({
  action: "grant_admin",
  actorUserId,
  targetUserId,
  reason: "Responsabilidad operativa verificada",
  tableAdminCount: 2,
  ...overrides,
});

test("acepta otorgar admin con usuario y motivo válidos", () => {
  const result = validate();
  assert.equal(result.ok, true);
  assert.equal(result.action, "grant_admin");
  assert.equal(result.targetUserId, targetUserId);
});

test("rechaza acciones sin motivo suficiente", () => {
  const result = validate({ reason: "corto" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
});

test("impide quitarse el rol o suspenderse a uno mismo", () => {
  for (const action of ["revoke_admin", "suspend_user"]) {
    const result = validate({
      action,
      targetUserId: actorUserId,
      targetIsAdmin: action === "revoke_admin",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
  }
});

test("exige quitar el rol antes de suspender un administrador", () => {
  const result = validate({ action: "suspend_user", targetIsAdmin: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /primero quitá/i);
});

test("no permite retirar un admin configurado en Vercel", () => {
  const result = validate({
    action: "revoke_admin",
    targetIsAdmin: true,
    targetIsConfiguredAdmin: true,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /Vercel/i);
});

test("no permite retirar el último admin guardado en la base", () => {
  const result = validate({
    action: "revoke_admin",
    targetIsAdmin: true,
    tableAdminCount: 1,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /último administrador/i);
});

test("acepta restaurar una cuenta con auditoría", () => {
  const result = validate({ action: "restore_user" });
  assert.equal(result.ok, true);
  assert.equal(result.action, "restore_user");
});

test("exige restaurar una cuenta antes de otorgarle rol admin", () => {
  const result = validate({ targetIsSuspended: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /restaurá la cuenta/i);
});
