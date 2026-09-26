import { jsonResponse } from "../../../../lib/apiResponse.js";
import { requireAdmin } from "../../../../lib/adminAuth.js";
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
    return { ok: false, error: "No se pudo leer el usuario de Auth para sincronizar metadata." };
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
    return { ok: false, error: "No se pudo sincronizar metadata de Auth." };
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
    if (Object.keys(diff).length === 0) {
      const metadataSync = await syncAuthUserMetadata(supabaseAdmin, targetUserId, validation.profile);
      if (!metadataSync.ok) {
        return jsonResponse({ error: metadataSync.error }, 500);
      }
      if (metadataSync.changed) {
        await supabaseAdmin.from("audit_logs").insert({
          user_id: admin.user.id,
          event: "admin_profile_update",
          metadata: {
            target_user_id: targetUserId,
            reason,
            diff: {},
            auth_metadata_synced: true,
            profile_changed: false,
          },
          ip_address: request.headers.get("x-forwarded-for") ?? null,
          user_agent: request.headers.get("user-agent") ?? null,
        });
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
      return jsonResponse({ error: "No se pudo actualizar el perfil." }, 500);
    }

    const metadataSync = await syncAuthUserMetadata(supabaseAdmin, targetUserId, validation.profile);
    if (!metadataSync.ok) {
      return jsonResponse({ error: `Perfil actualizado, pero ${metadataSync.error}` }, 500);
    }

    await supabaseAdmin.from("audit_logs").insert({
      user_id: admin.user.id,
      event: "admin_profile_update",
      metadata: {
        target_user_id: targetUserId,
        reason,
        diff,
        auth_metadata_synced: metadataSync.changed,
      },
      ip_address: request.headers.get("x-forwarded-for") ?? null,
      user_agent: request.headers.get("user-agent") ?? null,
    });

    return jsonResponse({ ok: true, changed: true, profile: updatedProfile });
  } catch (error) {
    console.error("[admin-users-profile] Unhandled error", error);
    return jsonResponse({ error: "No se pudo actualizar el perfil." }, 500);
  }
};
