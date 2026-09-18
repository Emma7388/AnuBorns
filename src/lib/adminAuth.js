import { getAuthenticatedUser } from "./serverAuth.js";

const ADMIN_TABLE = "admin_users";

const splitEnvList = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const getAdminEnvLists = () => {
  const env = import.meta.env ?? {};
  return {
    userIds: new Set(splitEnvList(process.env.ADMIN_USER_IDS ?? env.ADMIN_USER_IDS)),
    emails: new Set(splitEnvList(process.env.ADMIN_EMAILS ?? env.ADMIN_EMAILS).map((email) => email.toLowerCase())),
  };
};

const isConfiguredAdmin = (user) => {
  const userId = String(user?.id ?? "").trim();
  const email = String(user?.email ?? "").trim().toLowerCase();
  const { userIds, emails } = getAdminEnvLists();
  return Boolean((userId && userIds.has(userId)) || (email && emails.has(email)));
};

const isMissingAdminTableError = (error) => {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes(ADMIN_TABLE);
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
    return { ok: false, status: 403, error: "No tenés permiso para administrar usuarios." };
  }

  return { ok: true, user: auth.user, source: "table" };
};
