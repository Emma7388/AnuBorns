import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { requireAdmin } from "../src/lib/adminAuth.js";

const makeRequest = () =>
  new Request("http://localhost/api/admin/users", {
    headers: {
      authorization: "Bearer test-token",
    },
  });

const makeSupabaseAdmin = ({ user, tableData = null, tableError = null }) => {
  let tableWasQueried = false;
  return {
    get tableWasQueried() {
      return tableWasQueried;
    },
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: (table) => {
      tableWasQueried = true;
      assert.equal(table, "admin_users");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: tableData, error: tableError }),
      };
    },
  };
};

afterEach(() => {
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_EMAILS;
});

test("acepta admin configurado por ADMIN_USER_IDS sin consultar tabla", async () => {
  process.env.ADMIN_USER_IDS = "user-admin";
  const supabaseAdmin = makeSupabaseAdmin({
    user: { id: "user-admin", email: "admin@anuborns.test" },
  });

  const result = await requireAdmin(supabaseAdmin, makeRequest());

  assert.equal(result.ok, true);
  assert.equal(result.source, "env");
  assert.equal(supabaseAdmin.tableWasQueried, false);
});

test("acepta admin registrado en public.admin_users", async () => {
  const supabaseAdmin = makeSupabaseAdmin({
    user: { id: "user-admin", email: "admin@anuborns.test" },
    tableData: { user_id: "user-admin" },
  });

  const result = await requireAdmin(supabaseAdmin, makeRequest());

  assert.equal(result.ok, true);
  assert.equal(result.source, "table");
  assert.equal(supabaseAdmin.tableWasQueried, true);
});

test("rechaza usuarios sin permiso admin", async () => {
  const supabaseAdmin = makeSupabaseAdmin({
    user: { id: "user-normal", email: "user@anuborns.test" },
  });

  const result = await requireAdmin(supabaseAdmin, makeRequest());

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});
