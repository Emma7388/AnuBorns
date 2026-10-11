export const ADMIN_ACCESS_ACTIONS = new Set([
  "grant_admin",
  "revoke_admin",
  "suspend_user",
  "restore_user",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const normalizeAdminActionReason = (value) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

export const normalizeAdminAccessAction = (value) => String(value ?? "").trim().toLowerCase();

export const validateAdminAccessRequest = ({
  action,
  targetUserId,
  actorUserId,
  reason,
  targetIsAdmin = false,
  targetIsConfiguredAdmin = false,
  targetIsSuspended = false,
  tableAdminCount = 0,
} = {}) => {
  const safeAction = normalizeAdminAccessAction(action);
  const safeTargetUserId = String(targetUserId ?? "").trim();
  const safeActorUserId = String(actorUserId ?? "").trim();
  const safeReason = normalizeAdminActionReason(reason);

  if (!ADMIN_ACCESS_ACTIONS.has(safeAction)) {
    return { ok: false, status: 400, error: "Acción administrativa inválida." };
  }
  if (!UUID_PATTERN.test(safeTargetUserId)) {
    return { ok: false, status: 400, error: "Usuario inválido." };
  }
  if (safeReason.length < 6) {
    return { ok: false, status: 422, error: "Ingresá un motivo de al menos 6 caracteres." };
  }
  if (["revoke_admin", "suspend_user"].includes(safeAction) && safeTargetUserId === safeActorUserId) {
    return { ok: false, status: 409, error: "No podés quitarte permisos ni suspender tu propia cuenta." };
  }
  if (safeAction === "grant_admin" && targetIsAdmin) {
    return { ok: false, status: 409, error: "El usuario ya es administrador." };
  }
  if (safeAction === "grant_admin" && targetIsSuspended) {
    return { ok: false, status: 409, error: "Restaurá la cuenta antes de otorgarle permisos administrativos." };
  }
  if (safeAction === "revoke_admin" && !targetIsAdmin) {
    return { ok: false, status: 409, error: "El usuario no tiene un rol administrativo removible." };
  }
  if (safeAction === "revoke_admin" && targetIsConfiguredAdmin) {
    return { ok: false, status: 409, error: "El rol proviene de Vercel y debe retirarse de ADMIN_USER_IDS o ADMIN_EMAILS." };
  }
  if (safeAction === "revoke_admin" && Number(tableAdminCount) <= 1) {
    return { ok: false, status: 409, error: "No se puede quitar el último administrador guardado en la base." };
  }
  if (safeAction === "suspend_user" && targetIsAdmin) {
    return { ok: false, status: 409, error: "Primero quitá el rol administrativo antes de suspender esta cuenta." };
  }

  return {
    ok: true,
    action: safeAction,
    targetUserId: safeTargetUserId,
    reason: safeReason,
  };
};
