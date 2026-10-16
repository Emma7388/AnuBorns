import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { requireAdmin } from "../src/lib/adminAuth.js";

const makeRequest = () =>
  new Request("http://localhost/api/admin/users", {
    headers: {
      authorization: "Bearer test-token",
    },
  });

const makeSupabaseAdmin = ({
  user,
  tableData = null,
  tableError = null,
  controlData = null,
  controlError = null,
  auditError = null,
  auditThrow = false,
}) => {
  const queriedTables = [];
  const auditRows = [];
  return {
    get queriedTables() {
      return queriedTables;
    },
    get auditRows() {
      return auditRows;
    },
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: (table) => {
      queriedTables.push(table);
      assert.ok(["admin_users", "admin_user_controls", "audit_logs"].includes(table));
      if (table === "audit_logs") {
        return {
          insert: async (row) => {
            if (auditThrow) throw new Error("audit unavailable");
            auditRows.push(row);
            return { error: auditError };
          },
        };
      }
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => table === "admin_user_controls"
          ? ({ data: controlData, error: controlError })
          : ({ data: tableData, error: tableError }),
      };
    },
  };
};

afterEach(() => {
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_EMAILS;
});

test("acepta admin configurado por ADMIN_USER_IDS sin consultar admin_users", async () => {
  process.env.ADMIN_USER_IDS = "user-admin";
  const supabaseAdmin = makeSupabaseAdmin({
    user: { id: "user-admin", email: "admin@anuborns.test" },
  });

  const result = await requireAdmin(supabaseAdmin, makeRequest());

  assert.equal(result.ok, true);
  assert.equal(result.source, "env");
  assert.deepEqual(supabaseAdmin.queriedTables, ["admin_user_controls"]);
});

test("acepta admin registrado en public.admin_users", async () => {
  const supabaseAdmin = makeSupabaseAdmin({
    user: { id: "user-admin", email: "admin@anuborns.test" },
    tableData: { user_id: "user-admin" },
  });

  const result = await requireAdmin(supabaseAdmin, makeRequest());

  assert.equal(result.ok, true);
  assert.equal(result.source, "table");
  assert.deepEqual(supabaseAdmin.queriedTables, ["admin_user_controls", "admin_users"]);
});

test("rechaza usuarios sin permiso admin", async () => {
  const supabaseAdmin = makeSupabaseAdmin({
    user: { id: "user-normal", email: "user@anuborns.test" },
  });

  const result = await requireAdmin(supabaseAdmin, makeRequest());

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(supabaseAdmin.auditRows.length, 1);
  assert.equal(supabaseAdmin.auditRows[0].event, "admin_permission_denied");
  assert.equal(supabaseAdmin.auditRows[0].metadata.path, "/api/admin/users");
  assert.equal(supabaseAdmin.auditRows[0].metadata.status, "rejected");
});

test("mantiene el rechazo aunque falle la auditoría de permisos", async () => {
  const supabaseAdmin = makeSupabaseAdmin({
    user: { id: "user-normal-audit-failure", email: "user2@anuborns.test" },
    auditThrow: true,
  });

  const result = await requireAdmin(supabaseAdmin, makeRequest());

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("deduplica temporalmente el mismo acceso administrativo rechazado", async () => {
  const supabaseAdmin = makeSupabaseAdmin({
    user: { id: "user-normal-deduplicated", email: "dedupe@anuborns.test" },
  });

  const first = await requireAdmin(supabaseAdmin, makeRequest());
  const second = await requireAdmin(supabaseAdmin, makeRequest());

  assert.equal(first.status, 403);
  assert.equal(second.status, 403);
  assert.equal(supabaseAdmin.auditRows.length, 1);
});

test("rechaza una cuenta suspendida antes de validar su rol", async () => {
  process.env.ADMIN_USER_IDS = "user-admin";
  const supabaseAdmin = makeSupabaseAdmin({
    user: { id: "user-admin", email: "admin@anuborns.test" },
    controlData: { status: "suspended", reason: "control preventivo" },
  });

  const result = await requireAdmin(supabaseAdmin, makeRequest());

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.error, /suspendida/i);
  assert.deepEqual(supabaseAdmin.queriedTables, ["admin_user_controls"]);
});

test("tolera la tabla de controles ausente durante el despliegue gradual", async () => {
  process.env.ADMIN_USER_IDS = "user-admin";
  const supabaseAdmin = makeSupabaseAdmin({
    user: { id: "user-admin", email: "admin@anuborns.test" },
    controlError: { code: "PGRST205", message: "admin_user_controls not found" },
  });

  const result = await requireAdmin(supabaseAdmin, makeRequest());

  assert.equal(result.ok, true);
  assert.equal(result.source, "env");
});

test("frena la autorización si falla la lectura real del control de cuenta", async () => {
  process.env.ADMIN_USER_IDS = "user-admin";
  const supabaseAdmin = makeSupabaseAdmin({
    user: { id: "user-admin", email: "admin@anuborns.test" },
    controlError: { code: "08006", message: "connection failure" },
  });

  const result = await requireAdmin(supabaseAdmin, makeRequest());

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
});

test("rechaza también un bloqueo vigente informado por Supabase Auth", async () => {
  process.env.ADMIN_USER_IDS = "user-admin";
  const supabaseAdmin = makeSupabaseAdmin({
    user: {
      id: "user-admin",
      email: "admin@anuborns.test",
      banned_until: "2099-01-01T00:00:00.000Z",
    },
  });

  const result = await requireAdmin(supabaseAdmin, makeRequest());

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.deepEqual(supabaseAdmin.queriedTables, []);
});
