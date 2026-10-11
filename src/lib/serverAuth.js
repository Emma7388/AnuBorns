/* Autenticación Bearer compartida por rutas API del servidor. */
const ACCOUNT_CONTROL_TABLE = "admin_user_controls";

const isMissingAccountControlTable = (error) => {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes(ACCOUNT_CONTROL_TABLE);
};

const getAccountControl = async (supabaseAdmin, userId) => {
  const { data, error } = await supabaseAdmin
    .from(ACCOUNT_CONTROL_TABLE)
    .select("status,reason")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && !isMissingAccountControlTable(error)) {
    return { ok: false, status: 503, error: "No se pudo validar el estado de la cuenta." };
  }
  return { ok: true, control: data ?? null };
};

const isAuthUserBanned = (user) => {
  const bannedUntil = new Date(user?.banned_until ?? 0);
  return !Number.isNaN(bannedUntil.getTime()) && bannedUntil.getTime() > Date.now();
};

export const getAuthenticatedUser = async (supabaseAdmin, request) => {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "No autorizado." };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, status: 401, error: "No autorizado." };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "Sesión inválida." };
  }

  if (isAuthUserBanned(data.user)) {
    return { ok: false, status: 403, error: "Tu cuenta está suspendida. Contactá a administración." };
  }

  const account = await getAccountControl(supabaseAdmin, data.user.id);
  if (!account.ok) return account;
  if (account.control?.status === "suspended") {
    return { ok: false, status: 403, error: "Tu cuenta está suspendida. Contactá a administración." };
  }

  return { ok: true, user: data.user, accountControl: account.control };
};
