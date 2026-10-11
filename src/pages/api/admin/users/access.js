import { jsonResponse } from "../../../../lib/apiResponse.js";
import {
  ADMIN_ACCESS_ACTIONS,
  normalizeAdminAccessAction,
  normalizeAdminActionReason,
  validateAdminAccessRequest,
} from "../../../../lib/adminAccess.js";
import { isConfiguredAdmin, requireAdmin } from "../../../../lib/adminAuth.js";
import { writeAdminAudit } from "../../../../lib/adminAudit.js";
import { checkRateLimit } from "../../../../lib/serverRateLimit.js";
import { readJsonBody } from "../../../../lib/serverRequest.js";
import { getSupabaseAdmin } from "../../../../lib/supabaseServer.js";

const CONTROL_TABLE = "admin_user_controls";
const LONG_BAN_DURATION = "876000h";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isMissingControlTable = (error) => {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes(CONTROL_TABLE);
};

const writeOutcomeAudit = (supabaseAdmin, values) =>
  writeAdminAudit(supabaseAdmin, {
    ...values,
    event: `admin_access_action_${values.status}`,
  });

const isAuthUserBanned = (user) => {
  const bannedUntil = new Date(user?.banned_until ?? 0);
  return !Number.isNaN(bannedUntil.getTime()) && bannedUntil.getTime() > Date.now();
};

const getOperationErrorMessage = (error) => {
  const message = String(error?.message ?? "").toLowerCase();
  if (message.includes("last_admin_revoke_forbidden")) {
    return { status: 409, message: "No se puede quitar el último administrador guardado en la base." };
  }
  if (message.includes("suspended_admin_grant_forbidden")) {
    return { status: 409, message: "Restaurá la cuenta antes de otorgarle permisos administrativos." };
  }
  if (message.includes("admin_suspend_forbidden")) {
    return { status: 409, message: "Primero quitá el rol administrativo antes de suspender esta cuenta." };
  }
  if (message.includes("could not find the function") || message.includes("schema cache")) {
    return { status: 503, message: "Falta ejecutar o recargar docs/supabase-admin-control.sql en Supabase." };
  }
  return { status: 500, message: "No se pudo completar la acción administrativa." };
};

/** @type {import("astro").APIRoute} */
export const PATCH = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "admin-users-access",
      windowMs: 60_000,
      max: 30,
    });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas solicitudes. Intentá nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);

    const admin = await requireAdmin(supabaseAdmin, request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);

    const body = await readJsonBody(request, { maxBytes: 8_000 });
    if (!body.ok) return jsonResponse({ error: body.error }, body.status);

    const action = normalizeAdminAccessAction(body.data?.action);
    const targetUserId = String(body.data?.user_id ?? "").trim();
    const reason = normalizeAdminActionReason(body.data?.reason);
    if (!ADMIN_ACCESS_ACTIONS.has(action)) {
      return jsonResponse({ error: "Acción administrativa inválida." }, 400);
    }
    if (!UUID_PATTERN.test(targetUserId)) {
      return jsonResponse({ error: "Usuario inválido." }, 400);
    }
    if (reason.length < 6) {
      return jsonResponse({ error: "Ingresá un motivo de al menos 6 caracteres." }, 422);
    }
    const { data: targetResult, error: targetError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
    if (targetError || !targetResult?.user) {
      return jsonResponse({ error: "No se encontró el usuario objetivo." }, 404);
    }
    const targetUser = targetResult.user;

    const [adminRowResult, adminCountResult, controlResult] = await Promise.all([
      supabaseAdmin.from("admin_users").select("user_id").eq("user_id", targetUserId).maybeSingle(),
      supabaseAdmin.from("admin_users").select("user_id", { count: "exact", head: true }),
      supabaseAdmin.from(CONTROL_TABLE).select("status,reason").eq("user_id", targetUserId).maybeSingle(),
    ]);

    if (adminRowResult.error || adminCountResult.error) {
      return jsonResponse({ error: "No se pudo validar el rol administrativo." }, 500);
    }
    if (controlResult.error && isMissingControlTable(controlResult.error)) {
      return jsonResponse({ error: "Falta ejecutar docs/supabase-admin-control.sql en Supabase." }, 503);
    }
    if (controlResult.error) {
      return jsonResponse({ error: "No se pudo validar el estado de la cuenta." }, 500);
    }

    const targetIsConfiguredAdmin = isConfiguredAdmin(targetUser);
    const targetIsTableAdmin = Boolean(adminRowResult.data?.user_id);
    const targetIsAdmin = targetIsConfiguredAdmin || targetIsTableAdmin;
    const currentStatus = controlResult.data?.status === "suspended" || isAuthUserBanned(targetUser)
      ? "suspended"
      : "active";
    const validation = validateAdminAccessRequest({
      action,
      targetUserId,
      actorUserId: admin.user.id,
      reason,
      targetIsAdmin,
      targetIsConfiguredAdmin,
      targetIsSuspended: currentStatus === "suspended",
      tableAdminCount: adminCountResult.count ?? 0,
    });
    if (!validation.ok) return jsonResponse({ error: validation.error }, validation.status);

    if (action === "suspend_user" && currentStatus === "suspended") {
      return jsonResponse({ error: "La cuenta ya está suspendida." }, 409);
    }
    if (action === "restore_user" && currentStatus !== "suspended") {
      return jsonResponse({ error: "La cuenta ya está activa." }, 409);
    }

    const auditBase = {
      actorUserId: admin.user.id,
      targetUserId,
      action,
      reason,
      request,
      metadata: {
        actor_source: admin.source,
        target_email: String(targetUser.email ?? ""),
      },
    };
    const requestedAudit = await writeAdminAudit(supabaseAdmin, {
      ...auditBase,
      event: "admin_access_action_requested",
      status: "requested",
    });
    if (!requestedAudit.ok) {
      return jsonResponse({ error: "No se ejecutó la acción porque no pudo iniciarse su auditoría." }, 500);
    }

    let operationError = null;
    if (action === "grant_admin") {
      const { error } = await supabaseAdmin.rpc("set_admin_user_role_controlled", {
        p_target_user_id: targetUserId,
        p_actor_user_id: admin.user.id,
        p_grant: true,
      });
      operationError = error;
    } else if (action === "revoke_admin") {
      const { error } = await supabaseAdmin.rpc("set_admin_user_role_controlled", {
        p_target_user_id: targetUserId,
        p_actor_user_id: admin.user.id,
        p_grant: false,
      });
      operationError = error;
    } else if (action === "suspend_user") {
      const { error: controlError } = await supabaseAdmin.rpc("set_admin_user_suspension_controlled", {
        p_target_user_id: targetUserId,
        p_actor_user_id: admin.user.id,
        p_suspended: true,
        p_reason: reason,
      });
      if (controlError) {
        operationError = controlError;
      } else {
        const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          ban_duration: LONG_BAN_DURATION,
        });
        operationError = banError;
        if (banError) {
          await supabaseAdmin.rpc("set_admin_user_suspension_controlled", {
            p_target_user_id: targetUserId,
            p_actor_user_id: admin.user.id,
            p_suspended: false,
            p_reason: `Rollback: ${reason}`,
          });
        }
      }
    } else if (action === "restore_user") {
      const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        ban_duration: "none",
      });
      if (unbanError) {
        operationError = unbanError;
      } else {
        const { error: controlError } = await supabaseAdmin.rpc("set_admin_user_suspension_controlled", {
          p_target_user_id: targetUserId,
          p_actor_user_id: admin.user.id,
          p_suspended: false,
          p_reason: reason,
        });
        operationError = controlError;
        if (controlError) {
          await supabaseAdmin.auth.admin.updateUserById(targetUserId, { ban_duration: LONG_BAN_DURATION });
        }
      }
    }

    if (operationError) {
      await writeOutcomeAudit(supabaseAdmin, { ...auditBase, status: "failed" });
      const operationResponse = getOperationErrorMessage(operationError);
      return jsonResponse({ error: operationResponse.message }, operationResponse.status);
    }

    const completedAudit = await writeOutcomeAudit(supabaseAdmin, { ...auditBase, status: "completed" });
    if (!completedAudit.ok) {
      return jsonResponse({ error: "La acción se completó, pero falló su confirmación de auditoría. Revisá audit_logs." }, 500);
    }

    return jsonResponse({ ok: true, action, user_id: targetUserId });
  } catch (error) {
    console.error("[admin-users-access] Unhandled error", error);
    return jsonResponse({ error: "No se pudo completar la acción administrativa." }, 500);
  }
};
