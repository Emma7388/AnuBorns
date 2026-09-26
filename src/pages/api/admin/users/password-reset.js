import { jsonResponse } from "../../../../lib/apiResponse.js";
import { requireAdmin } from "../../../../lib/adminAuth.js";
import { checkRateLimit } from "../../../../lib/serverRateLimit.js";
import { readJsonBody } from "../../../../lib/serverRequest.js";
import { getSupabaseAdmin } from "../../../../lib/supabaseServer.js";

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));

const resolveSiteUrl = () => {
  const raw = String(process.env.SITE_URL ?? import.meta.env?.SITE_URL ?? "").trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
};

const buildRecoveryRedirectUrl = () => {
  const siteUrl = resolveSiteUrl();
  if (!siteUrl) return null;
  const url = new URL("/nueva-contrasena", siteUrl);
  url.searchParams.set("returnTo", "/login");
  return url.toString();
};

/** @type {import("astro").APIRoute} */
export const POST = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "admin-users-password-reset",
      windowMs: 60_000,
      max: 20,
    });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas solicitudes. Intentá nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);

    const admin = await requireAdmin(supabaseAdmin, request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);

    const body = await readJsonBody(request, { maxBytes: 4_000 });
    if (!body.ok) return jsonResponse({ error: body.error }, body.status);

    const targetUserId = String(body.data?.user_id ?? "").trim();
    if (!isUuid(targetUserId)) {
      return jsonResponse({ error: "Usuario inválido." }, 400);
    }

    const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
    const email = String(userResult?.user?.email ?? "").trim();
    if (userError || !email) {
      return jsonResponse({ error: "No se pudo obtener el email del usuario." }, 404);
    }

    const redirectTo = buildRecoveryRedirectUrl();
    if (!redirectTo) {
      return jsonResponse({ error: "SITE_URL debe estar configurado con HTTPS para enviar restablecimientos." }, 503);
    }

    const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo });
    if (resetError) {
      return jsonResponse({ error: "No se pudo enviar el email de restablecimiento." }, 502);
    }

    const sentAt = new Date().toISOString();
    await supabaseAdmin.from("audit_logs").insert({
      user_id: admin.user.id,
      event: "admin_password_reset_requested",
      metadata: {
        target_user_id: targetUserId,
        target_email: email,
      },
      ip_address: request.headers.get("x-forwarded-for") ?? null,
      user_agent: request.headers.get("user-agent") ?? null,
      created_at: sentAt,
    });

    return jsonResponse({ ok: true, sent_at: sentAt });
  } catch (error) {
    console.error("[admin-users-password-reset] Unhandled error", error);
    return jsonResponse({ error: "No se pudo enviar el email de restablecimiento." }, 500);
  }
};
