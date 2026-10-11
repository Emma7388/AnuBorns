import assert from "node:assert/strict";
import { test } from "node:test";
import { writeAdminAudit } from "../src/lib/adminAudit.js";

test("guarda una auditoría administrativa sanitizada", async () => {
  let inserted = null;
  const supabaseAdmin = {
    from(table) {
      assert.equal(table, "audit_logs");
      return {
        insert: async (row) => {
          inserted = row;
          return { error: null };
        },
      };
    },
  };
  const request = new Request("https://anuborns.com/admin", {
    headers: {
      "x-forwarded-for": "127.0.0.1",
      "user-agent": "test-agent",
    },
  });

  const result = await writeAdminAudit(supabaseAdmin, {
    actorUserId: "actor-id",
    event: "admin_access_action_completed\n",
    targetUserId: "target-id",
    action: "suspend_user",
    reason: "  control\npreventivo  ",
    status: "completed",
    request,
    createdAt: "2026-10-11T12:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(inserted.event, "admin_access_action_completed");
  assert.equal(inserted.metadata.reason, "control preventivo");
  assert.equal(inserted.metadata.target_user_id, "target-id");
  assert.equal(inserted.ip_address, "127.0.0.1");
});

test("rechaza una auditoría sin actor o evento", async () => {
  const result = await writeAdminAudit({}, { actorUserId: "", event: "" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_admin_audit");
});
