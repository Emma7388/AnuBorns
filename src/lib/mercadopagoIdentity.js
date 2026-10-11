const IDENTITY_EXCEPTION_MP_USER_IDS = new Set(["1157622469"]);

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();
const normalizeDigits = (value) => String(value ?? "").replace(/\D/g, "");

export const compareMercadoPagoIdentity = ({ mpAccount, profile, authUser } = {}) => {
  const mpUserId = String(mpAccount?.id ?? "").trim();
  if (IDENTITY_EXCEPTION_MP_USER_IDS.has(mpUserId)) {
    return { matches: true, exception: true, mismatches: [] };
  }

  const mismatches = [];
  const profileName = normalizeText(`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`);
  const mpName = normalizeText(`${mpAccount?.first_name ?? ""} ${mpAccount?.last_name ?? ""}`);
  const profileEmail = normalizeEmail(authUser?.email ?? profile?.email);
  const mpEmail = normalizeEmail(mpAccount?.email);
  const profileDni = normalizeDigits(profile?.dni);
  const mpDni = normalizeDigits(mpAccount?.identification?.number);

  if (!profileName || !mpName || profileName !== mpName) mismatches.push("nombre y apellido");
  if (mpEmail && (!profileEmail || profileEmail !== mpEmail)) mismatches.push("email");
  if (mpDni && (!profileDni || profileDni !== mpDni)) mismatches.push("DNI");

  return { matches: mismatches.length === 0, exception: false, mismatches };
};

export const fetchMercadoPagoUser = async (accessToken) => {
  const token = String(accessToken ?? "").trim();
  if (!token) return { ok: false, error: "missing_access_token" };
  try {
    const response = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const account = await response.json().catch(() => ({}));
    if (!response.ok || !account?.id) {
      return { ok: false, error: String(account?.message ?? `HTTP ${response.status}`) };
    }
    return { ok: true, account };
  } catch {
    return { ok: false, error: "mercadopago_unavailable" };
  }
};

export const validateSellerMercadoPagoIdentity = async (supabaseAdmin, user) => {
  const [{ data: connection }, { data: profile }] = await Promise.all([
    supabaseAdmin
      .from("seller_mercadopago_accounts")
      .select("user_id,mp_user_id,access_token,refresh_token,expires_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select("first_name,last_name,phone,dni,address,city,province,postal_code")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!connection?.access_token || !connection?.mp_user_id) {
    return { ok: false, status: 409, error: "Conectá tu cuenta de Mercado Pago para vender." };
  }
  const fetched = await fetchMercadoPagoUser(connection.access_token);
  if (!fetched.ok) {
    return { ok: false, status: 502, error: "No se pudo validar tu cuenta de Mercado Pago." };
  }
  if (String(fetched.account.id) !== String(connection.mp_user_id)) {
    return { ok: false, status: 409, error: "La conexión no corresponde a la cuenta Mercado Pago guardada." };
  }
  const identity = compareMercadoPagoIdentity({ mpAccount: fetched.account, profile, authUser: user });
  if (!identity.matches) {
    return {
      ok: false,
      status: 409,
      error: `Los datos no coinciden con Mercado Pago: ${identity.mismatches.join(", ")}. Actualizá Mis datos y volvé a intentar.`,
      mismatches: identity.mismatches,
      mpAccount: fetched.account,
    };
  }
  return { ok: true, connection, profile, mpAccount: fetched.account, identity };
};
