const cleanAuditText = (value, maxLength = 240) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

export const writeAdminAudit = async (supabaseAdmin, {
  actorUserId,
  event,
  targetUserId = "",
  action = "",
  reason = "",
  status = "",
  metadata = {},
  request,
  createdAt,
} = {}) => {
  const safeActorUserId = String(actorUserId ?? "").trim();
  const safeEvent = cleanAuditText(event, 100);
  if (!supabaseAdmin || !safeActorUserId || !safeEvent) {
    return { ok: false, error: "invalid_admin_audit" };
  }

  const { error } = await supabaseAdmin.from("audit_logs").insert({
    user_id: safeActorUserId,
    event: safeEvent,
    metadata: {
      ...(metadata && typeof metadata === "object" ? metadata : {}),
      target_user_id: String(targetUserId ?? "").trim() || undefined,
      action: cleanAuditText(action, 60) || undefined,
      reason: cleanAuditText(reason) || undefined,
      status: cleanAuditText(status, 40) || undefined,
    },
    ip_address: request?.headers?.get("x-forwarded-for") ?? null,
    user_agent: request?.headers?.get("user-agent") ?? null,
    created_at: createdAt ?? new Date().toISOString(),
  });

  return error ? { ok: false, error: error.message } : { ok: true };
};
