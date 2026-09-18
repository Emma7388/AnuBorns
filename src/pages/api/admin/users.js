import { jsonResponse } from "../../../lib/apiResponse.js";
import { requireAdmin } from "../../../lib/adminAuth.js";
import { checkRateLimit } from "../../../lib/serverRateLimit.js";
import { getSupabaseAdmin } from "../../../lib/supabaseServer.js";

const PROFILE_SELECT =
  "user_id, first_name, last_name, phone, dni, address, city, province, postal_code, created_at, updated_at";
const MP_SELECT = "user_id, mp_user_id, updated_at";
const SEARCH_AUTH_LIMIT = 1000;
const DEFAULT_PER_PAGE = 30;
const MAX_PER_PAGE = 50;

const cleanSearch = (value) => String(value ?? "").trim().slice(0, 80);

const clampInt = (value, { min, max, fallback }) => {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

const sanitizeLike = (value) => cleanSearch(value).replace(/[%_,]/g, " ");

const normalizeText = (value) => String(value ?? "").trim().toLowerCase();

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const getUsersByIds = async (supabaseAdmin, userIds) => {
  const users = [];
  for (const userId of unique(userIds).slice(0, MAX_PER_PAGE)) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (!error && data?.user) users.push(data.user);
  }
  return users;
};

const listAuthUsers = async (supabaseAdmin, { page, perPage }) => {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
  if (error) throw error;
  return data?.users ?? [];
};

const fetchProfiles = async (supabaseAdmin, userIds) => {
  if (!userIds.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_SELECT)
    .in("user_id", userIds);
  if (error) throw error;
  return new Map((data ?? []).map((profile) => [String(profile.user_id), profile]));
};

const fetchMatchingProfiles = async (supabaseAdmin, query) => {
  const term = sanitizeLike(query);
  if (!term) return [];
  const filters = [
    `first_name.ilike.%${term}%`,
    `last_name.ilike.%${term}%`,
    `phone.ilike.%${term}%`,
    `dni.ilike.%${term}%`,
    `city.ilike.%${term}%`,
  ];

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_SELECT)
    .or(filters.join(","))
    .limit(MAX_PER_PAGE);
  if (error) throw error;
  return data ?? [];
};

const fetchMercadoPagoAccounts = async (supabaseAdmin, userIds) => {
  if (!userIds.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("seller_mercadopago_accounts")
    .select(MP_SELECT)
    .in("user_id", userIds);
  if (error) return new Map();
  return new Map((data ?? []).map((account) => [String(account.user_id), account]));
};

const profileMatches = (profile, query) => {
  const needle = normalizeText(query);
  if (!needle) return true;
  return [
    profile?.first_name,
    profile?.last_name,
    profile?.phone,
    profile?.dni,
    profile?.city,
    profile?.province,
    profile?.postal_code,
    profile?.user_id,
  ].some((value) => normalizeText(value).includes(needle));
};

const authUserMatches = (user, query) => {
  const needle = normalizeText(query);
  if (!needle) return true;
  return [user?.id, user?.email].some((value) => normalizeText(value).includes(needle));
};

const getUserMetadata = (user) => {
  const metadata = user?.user_metadata ?? {};
  return {
    first_name: metadata.first_name ?? "",
    last_name: metadata.last_name ?? "",
    phone: metadata.phone ?? "",
    dni: metadata.dni ?? "",
    address: metadata.address ?? "",
    city: metadata.city ?? "",
    province: metadata.province ?? "",
    postal_code: metadata.postal_code ?? "",
  };
};

const formatUser = ({ user, profile, mpAccount }) => {
  const metadata = getUserMetadata(user);
  const safeProfile = { ...metadata, ...(profile ?? {}) };
  return {
    id: user.id,
    email: user.email ?? "",
    created_at: user.created_at ?? "",
    last_sign_in_at: user.last_sign_in_at ?? "",
    email_confirmed_at: user.email_confirmed_at ?? user.confirmed_at ?? "",
    profile: {
      first_name: safeProfile.first_name ?? "",
      last_name: safeProfile.last_name ?? "",
      phone: safeProfile.phone ?? "",
      dni: safeProfile.dni ?? "",
      address: safeProfile.address ?? "",
      city: safeProfile.city ?? "",
      province: safeProfile.province ?? "",
      postal_code: safeProfile.postal_code ?? "",
      updated_at: safeProfile.updated_at ?? "",
    },
    mercado_pago: {
      connected: Boolean(mpAccount?.mp_user_id),
      mp_user_id: mpAccount?.mp_user_id ?? "",
      updated_at: mpAccount?.updated_at ?? "",
    },
  };
};

const findUsers = async (supabaseAdmin, { query, page, perPage }) => {
  if (!query) {
    return {
      users: await listAuthUsers(supabaseAdmin, { page, perPage }),
      hasMore: false,
    };
  }

  const [authUsers, matchingProfiles] = await Promise.all([
    listAuthUsers(supabaseAdmin, { page: 1, perPage: SEARCH_AUTH_LIMIT }),
    fetchMatchingProfiles(supabaseAdmin, query),
  ]);

  const emailMatches = authUsers.filter((user) => authUserMatches(user, query));
  const profileIds = matchingProfiles.map((profile) => String(profile.user_id ?? ""));
  const authIds = new Set(authUsers.map((user) => String(user.id)));
  const missingProfileUserIds = profileIds.filter((userId) => userId && !authIds.has(userId));
  const profileAuthUsers = await getUsersByIds(supabaseAdmin, missingProfileUserIds);
  const usersById = new Map([...emailMatches, ...profileAuthUsers].map((user) => [String(user.id), user]));

  for (const user of authUsers) {
    const profile = matchingProfiles.find((item) => String(item.user_id) === String(user.id));
    if (profile && profileMatches(profile, query)) usersById.set(String(user.id), user);
  }

  return { users: Array.from(usersById.values()).slice(0, perPage), hasMore: false };
};

/** @type {import("astro").APIRoute} */
export const GET = async ({ request, url }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "admin-users",
      windowMs: 60_000,
      max: 90,
    });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas solicitudes. Intentá nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);

    const admin = await requireAdmin(supabaseAdmin, request);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);

    const query = cleanSearch(url.searchParams.get("q"));
    const page = clampInt(url.searchParams.get("page"), { min: 1, max: 1000, fallback: 1 });
    const perPage = clampInt(url.searchParams.get("perPage"), {
      min: 1,
      max: MAX_PER_PAGE,
      fallback: DEFAULT_PER_PAGE,
    });

    const { users, hasMore } = await findUsers(supabaseAdmin, { query, page, perPage });
    const userIds = users.map((user) => String(user.id)).filter(Boolean);
    const [profilesById, mpAccountsById] = await Promise.all([
      fetchProfiles(supabaseAdmin, userIds),
      fetchMercadoPagoAccounts(supabaseAdmin, userIds),
    ]);

    const records = users.map((user) =>
      formatUser({
        user,
        profile: profilesById.get(String(user.id)),
        mpAccount: mpAccountsById.get(String(user.id)),
      }),
    );

    return jsonResponse({
      ok: true,
      users: records,
      pagination: {
        page,
        perPage,
        hasMore: hasMore || (!query && records.length === perPage),
      },
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "No se pudieron cargar los usuarios." }, 500);
  }
};
