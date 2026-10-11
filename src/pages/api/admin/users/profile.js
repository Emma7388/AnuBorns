import { jsonResponse } from "../../../../lib/apiResponse.js";
import { requireAdmin } from "../../../../lib/adminAuth.js";
import { writeAdminAudit } from "../../../../lib/adminAudit.js";
import {
  ADMIN_PROFILE_FIELDS,
  buildProfileDiff,
  mergeAdminProfileMetadata,
  normalizeAdminReason,
  validateAdminProfileInput,
} from "../../../../lib/adminProfile.js";
import { checkRateLimit } from "../../../../lib/serverRateLimit.js";
import { readJsonBody } from "../../../../lib/serverRequest.js";
import { getSupabaseAdmin } from "../../../../lib/supabaseServer.js";

const PROFILE_SELECT = `user_id, ${ADMIN_PROFILE_FIELDS.join(", ")}, updated_at`;

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));

const syncAuthUserMetadata = async (supabaseAdmin, userId, profile) => {
  const { data: targetAuthUser, error: targetAuthError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (targetAuthError || !targetAuthUser?.user) {
    return { ok: false, error: "No se pudo leer el usuario de autenticacion para sincronizar metadata." };
  }

  const currentMetadata = targetAuthUser.user.user_metadata ?? {};
  const nextMetadata = mergeAdminProfileMetadata(targetAuthUser.user.user_metadata, profile);
  const changed = ADMIN_PROFILE_FIELDS.some((field) =>
    String(currentMetadata?.[field] ?? "") !== String(nextMetadata?.[field] ?? ""),
  );
  if (!changed) return { ok: true, changed: false };

  const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: nextMetadata,
  });
  if (metadataError) {
    return { ok: false, error: "No se pudo sincronizar metadata de autenticacion." };
  }

  return { ok: true, changed: true };
};

/** @type {import("astro").APIRoute} */
export const PATCH = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "admin-users-profile",
      windowMs: 60_000,
      max: 40,
    });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas solicitudes. Intentá nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);

    const admin = await requireAdmin(supabaseAdmin, request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);

    const body = await readJsonBody(request, { maxBytes: 12_000 });
    if (!body.ok) return jsonResponse({ error: body.error }, body.status);
    const payload = body.data;
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "Payload inválido." }, 400);
    }

    const targetUserId = String(payload?.user_id ?? "").trim();
    if (!isUuid(targetUserId)) {
      return jsonResponse({ error: "Usuario inválido." }, 400);
    }

    const reason = normalizeAdminReason(payload?.reason);
    if (reason.length < 6) {
      return jsonResponse({ error: "Ingresá un motivo para auditar el cambio." }, 400);
    }

    const validation = validateAdminProfileInput(payload?.profile ?? {});
    if (!validation.ok) {
      return jsonResponse({ error: validation.errors[0] ?? "Revisá los datos ingresados." }, 422);
    }

    const { data: existingProfile, error: existingError } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (existingError) {
      return jsonResponse({ error: "No se pudo leer el perfil actual." }, 500);
    }

    const before = existingProfile ?? { user_id: targetUserId };
    const diff = buildProfileDiff(before, validation.profile);
    const auditBase = {
      actorUserId: admin.user.id,
      targetUserId,
      action: "update_profile",
      reason,
      request,
      metadata: {
        actor_source: admin.source,
        diff,
      },
    };
    const requestedAudit = await writeAdminAudit(supabaseAdmin, {
      ...auditBase,
      event: "admin_profile_update_requested",
      status: "requested",
    });
    if (!requestedAudit.ok) {
      return jsonResponse({ error: "No se modificó el perfil porque no pudo iniciarse su auditoría." }, 500);
    }

    if (Object.keys(diff).length === 0) {
      const metadataSync = await syncAuthUserMetadata(supabaseAdmin, targetUserId, validation.profile);
      if (!metadataSync.ok) {
        await writeAdminAudit(supabaseAdmin, {
          ...auditBase,
          event: "admin_profile_update_failed",
          status: "failed",
          metadata: { ...auditBase.metadata, failure: "auth_metadata_sync" },
        });
        return jsonResponse({ error: metadataSync.error }, 500);
      }
      const completedAudit = await writeAdminAudit(supabaseAdmin, {
        ...auditBase,
        event: "admin_profile_update",
        status: "completed",
        metadata: {
          ...auditBase.metadata,
          auth_metadata_synced: metadataSync.changed,
          profile_changed: false,
        },
      });
      if (!completedAudit.ok) {
        return jsonResponse({ error: "El perfil no cambió, pero falló la confirmación de auditoría." }, 500);
      }
      return jsonResponse({ ok: true, changed: false, profile: { ...before, ...validation.profile } });
    }

    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          user_id: targetUserId,
          ...validation.profile,
        },
        { onConflict: "user_id" },
      )
      .select(PROFILE_SELECT)
      .single();

    if (updateError || !updatedProfile) {
      await writeAdminAudit(supabaseAdmin, {
        ...auditBase,
        event: "admin_profile_update_failed",
        status: "failed",
        metadata: { ...auditBase.metadata, failure: "profile_upsert" },
      });
      return jsonResponse({ error: "No se pudo actualizar el perfil." }, 500);
    }

    const metadataSync = await syncAuthUserMetadata(supabaseAdmin, targetUserId, validation.profile);
    if (!metadataSync.ok) {
      await writeAdminAudit(supabaseAdmin, {
        ...auditBase,
        event: "admin_profile_update_failed",
        status: "failed",
        metadata: { ...auditBase.metadata, failure: "auth_metadata_sync", profile_changed: true },
      });
      return jsonResponse({ error: `Perfil actualizado, pero ${metadataSync.error}` }, 500);
    }

    const completedAudit = await writeAdminAudit(supabaseAdmin, {
      ...auditBase,
      event: "admin_profile_update",
      metadata: {
        ...auditBase.metadata,
        auth_metadata_synced: metadataSync.changed,
        profile_changed: true,
      },
      status: "completed",
    });
    if (!completedAudit.ok) {
      return jsonResponse({ error: "El perfil se actualizó, pero falló su confirmación de auditoría. Revisá audit_logs." }, 500);
    }

    return jsonResponse({ ok: true, changed: true, profile: updatedProfile });
  } catch (error) {
    console.error("[admin-users-profile] Unhandled error", error);
    return jsonResponse({ error: "No se pudo actualizar el perfil." }, 500);
  }
};
