import { getAuthenticatedUser } from "./serverAuth.js";
import { writeAdminAudit } from "./adminAudit.js";

const ADMIN_TABLE = "admin_users";
const DENIED_AUDIT_TTL_MS = 5 * 60 * 1000;
const MAX_DENIED_AUDIT_KEYS = 500;
const deniedAuditCache = new Map();

const splitEnvList = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const getAdminEnvLists = () => {
  const env = import.meta.env ?? {};
  return {
    userIds: new Set(splitEnvList(process.env.ADMIN_USER_IDS ?? env.ADMIN_USER_IDS)),
    emails: new Set(splitEnvList(process.env.ADMIN_EMAILS ?? env.ADMIN_EMAILS).map((email) => email.toLowerCase())),
  };
};

export const getConfiguredAdminSource = (user) => {
  const userId = String(user?.id ?? "").trim();
  const email = String(user?.email ?? "").trim().toLowerCase();
  const { userIds, emails } = getAdminEnvLists();
  return {
    byUserId: Boolean(userId && userIds.has(userId)),
    byEmail: Boolean(email && emails.has(email)),
  };
};

export const isConfiguredAdmin = (user) => {
  const source = getConfiguredAdminSource(user);
  return source.byUserId || source.byEmail;
};

const isMissingAdminTableError = (error) => {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes(ADMIN_TABLE);
};

const getRequestPath = (request) => {
  try {
    return new URL(request?.url ?? "http://localhost/").pathname.slice(0, 160);
  } catch {
    return "/api/admin";
  }
};

const recordDeniedAdminAccess = async (supabaseAdmin, user, request) => {
  const userId = String(user?.id ?? "").trim();
  if (!userId) return;
  const path = getRequestPath(request);
  const cacheKey = `${userId}::${path}`;
  const now = Date.now();
  const previous = deniedAuditCache.get(cacheKey) ?? 0;
  if (now - previous < DENIED_AUDIT_TTL_MS) return;
  deniedAuditCache.set(cacheKey, now);
  if (deniedAuditCache.size > MAX_DENIED_AUDIT_KEYS) {
    for (const [key, timestamp] of deniedAuditCache) {
      if (now - timestamp >= DENIED_AUDIT_TTL_MS) deniedAuditCache.delete(key);
    }
  }

  try {
    await writeAdminAudit(supabaseAdmin, {
      actorUserId: userId,
      event: "admin_permission_denied",
      action: "access_admin_panel",
      reason: "missing_admin_role",
      status: "rejected",
      metadata: { path },
      request,
    });
  } catch {
    // La auditoría es best-effort y nunca debe cambiar el rechazo 403.
  }
};

export const requireAdmin = async (supabaseAdmin, request) => {
  const auth = await getAuthenticatedUser(supabaseAdmin, request);
  if (!auth.ok) return auth;

  if (isConfiguredAdmin(auth.user)) {
    return { ok: true, user: auth.user, source: "env" };
  }

  const { data, error } = await supabaseAdmin
    .from(ADMIN_TABLE)
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 403,
      error: isMissingAdminTableError(error)
        ? "Panel admin no configurado. Ejecutá el SQL de administradores antes de usarlo."
        : "No se pudo validar el permiso de administrador.",
    };
  }

  if (!data?.user_id) {
    await recordDeniedAdminAccess(supabaseAdmin, auth.user, request);
    return { ok: false, status: 403, error: "No tenés permiso para acceder al panel administrativo." };
  }

  return { ok: true, user: auth.user, source: "table" };
};
