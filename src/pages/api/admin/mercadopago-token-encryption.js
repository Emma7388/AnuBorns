import { jsonResponse } from "../../../lib/apiResponse.js";
import { writeAdminAudit } from "../../../lib/adminAudit.js";
import { requireAdmin } from "../../../lib/adminAuth.js";
import {
  encryptMercadoPagoAccountTokens,
  getMercadoPagoTokenEncryptionStatus,
  isEncryptedMercadoPagoToken,
} from "../../../lib/mercadopagoTokenCrypto.js";
import { checkRateLimit } from "../../../lib/serverRateLimit.js";
import { getSupabaseAdmin } from "../../../lib/supabaseServer.js";

/** @type {import("astro").APIRoute} */
export const POST = async ({ request }) => {
  try {
    const rate = await checkRateLimit({
      request,
      routeKey: "admin-mp-token-encryption",
      windowMs: 60_000,
      max: 5,
    });
    if (!rate.allowed) return jsonResponse({ error: "Demasiadas solicitudes. Intentá nuevamente en un minuto." }, 429);

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);
    const admin = await requireAdmin(supabaseAdmin, request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);

    const encryption = getMercadoPagoTokenEncryptionStatus();
    if (!encryption.valid) {
      return jsonResponse({ error: "Configurá una clave válida para cifrar los tokens de Mercado Pago." }, 503);
    }

    const { data: accounts, error } = await supabaseAdmin
      .from("seller_mercadopago_accounts")
      .select("user_id,access_token,refresh_token")
      .limit(1000);
    if (error) return jsonResponse({ error: "No se pudieron consultar las conexiones de Mercado Pago." }, 500);

    let migrated = 0;
    let alreadyEncrypted = 0;
    const failures = [];
    for (const account of accounts ?? []) {
      const tokenValues = [account.access_token, account.refresh_token].filter(Boolean);
      if (tokenValues.every(isEncryptedMercadoPagoToken)) {
        alreadyEncrypted += 1;
        continue;
      }

      const encrypted = encryptMercadoPagoAccountTokens(account);
      const { error: updateError } = await supabaseAdmin
        .from("seller_mercadopago_accounts")
        .update(encrypted)
        .eq("user_id", account.user_id);
      if (updateError) failures.push(String(account.user_id));
      else migrated += 1;
    }

    await writeAdminAudit(supabaseAdmin, {
      actorUserId: admin.user.id,
      event: "admin_mp_tokens_encrypted",
      action: "encrypt_mercadopago_oauth_tokens",
      reason: "security_hardening",
      status: failures.length ? "partial" : "completed",
      metadata: { migrated, already_encrypted: alreadyEncrypted, failures: failures.length },
      request,
    });

    if (failures.length) {
      return jsonResponse({
        error: "Algunas conexiones no se pudieron cifrar. La operación se puede repetir sin duplicar cambios.",
        migrated,
        already_encrypted: alreadyEncrypted,
        failed: failures.length,
      }, 500);
    }

    return jsonResponse({ ok: true, migrated, already_encrypted: alreadyEncrypted });
  } catch (error) {
    console.error("[admin-mp-token-encryption] failed", error?.message ?? error);
    return jsonResponse({ error: "No se pudieron cifrar los tokens de Mercado Pago." }, 500);
  }
};
