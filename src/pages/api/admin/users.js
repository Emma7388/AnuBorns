import { jsonResponse } from "../../../lib/apiResponse.js";
import { getConfiguredAdminSource, requireAdmin } from "../../../lib/adminAuth.js";
import { checkRateLimit } from "../../../lib/serverRateLimit.js";
import { getSupabaseAdmin } from "../../../lib/supabaseServer.js";

const PROFILE_SELECT =
  "user_id, first_name, last_name, phone, dni, address, city, province, postal_code, created_at, updated_at";
const MP_SELECT = "user_id, mp_user_id, updated_at";
const MAX_PER_PAGE = 50;
const AUTH_LIST_PAGE_SIZE = 1000;
const AUTH_LIST_MAX_PAGES = 100;
const CONTROL_TABLE = "admin_user_controls";
const RECENT_AUDIT_LIMIT = 40;

const cleanSearch = (value) => String(value ?? "").trim().slice(0, 80);

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

const listAllAuthUsers = async (supabaseAdmin) => {
  const users = [];
  for (let page = 1; page <= AUTH_LIST_MAX_PAGES; page += 1) {
    const pageUsers = await listAuthUsers(supabaseAdmin, {
      page,
      perPage: AUTH_LIST_PAGE_SIZE,
    });
    users.push(...pageUsers);
    if (pageUsers.length < AUTH_LIST_PAGE_SIZE) break;
  }
  return users;
};

const fetchProfiles = async (supabaseAdmin, userIds) => {
  if (!userIds.length) return new Map();
  const rows = [];
  const ids = unique(userIds);
  for (let index = 0; index < ids.length; index += 500) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_SELECT)
      .in("user_id", ids.slice(index, index + 500));
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return new Map(rows.map((profile) => [String(profile.user_id), profile]));
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
  const rows = [];
  const ids = unique(userIds);
  for (let index = 0; index < ids.length; index += 500) {
    const chunk = ids.slice(index, index + 500);
    const { data, error } = await supabaseAdmin
      .from("seller_mercadopago_accounts")
      .select(MP_SELECT)
      .in("user_id", chunk);
    if (error) return new Map();
    rows.push(...(data ?? []));
  }
  return new Map(rows.map((account) => [String(account.user_id), account]));
};

const fetchPasswordResetRequests = async (supabaseAdmin, userIds) => {
  const targetUserIds = new Set(userIds.map((userId) => String(userId ?? "")).filter(Boolean));
  if (!targetUserIds.size) return new Map();

  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("metadata, created_at")
    .eq("event", "admin_password_reset_requested")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return new Map();

  const resetMap = new Map();
  for (const row of data ?? []) {
    const targetUserId = String(row?.metadata?.target_user_id ?? "").trim();
    if (!targetUserIds.has(targetUserId) || resetMap.has(targetUserId)) continue;
    resetMap.set(targetUserId, {
      last_sent_at: row?.created_at ?? "",
    });
  }
  return resetMap;
};

const countConnectedMercadoPagoAccounts = (accountsById) =>
  Array.from(accountsById.values()).filter((account) => String(account?.mp_user_id ?? "").trim()).length;

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

const formatUser = ({ user, profile, mpAccount, passwordReset, access }) => {
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
    password_reset: {
      last_sent_at: passwordReset?.last_sent_at ?? "",
    },
    access: access ?? {
      is_admin: false,
      admin_source: "",
      is_current_admin: false,
      status: "active",
      is_suspended: false,
      reason: "",
      suspended_at: "",
      updated_at: "",
    },
  };
};

const buildUsersResult = (users, directoryUsers = users) => ({
  users,
  directoryUsers,
  allUserIds: directoryUsers.map((user) => String(user.id ?? "")).filter(Boolean),
  total: users.length,
});

const findUsers = async (supabaseAdmin, { query }) => {
  if (!query) {
    const directoryUsers = await listAllAuthUsers(supabaseAdmin);
    return buildUsersResult(directoryUsers, directoryUsers);
  }

  const [authUsers, matchingProfiles] = await Promise.all([
    listAllAuthUsers(supabaseAdmin),
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

  return buildUsersResult(Array.from(usersById.values()), authUsers);
};

const isMissingControlTable = (error) => {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes(CONTROL_TABLE);
};

const fetchAdminRows = async (supabaseAdmin) => {
  const { data, error } = await supabaseAdmin.from("admin_users").select("user_id");
  if (error) throw error;
  return data ?? [];
};

const fetchAccountControls = async (supabaseAdmin, userIds) => {
  const ids = unique(userIds);
  if (!ids.length) return { ready: true, byId: new Map() };
  const rows = [];
  for (let index = 0; index < ids.length; index += 500) {
    const { data, error } = await supabaseAdmin
      .from(CONTROL_TABLE)
      .select("user_id,status,reason,suspended_at,updated_at,updated_by")
      .in("user_id", ids.slice(index, index + 500));
    if (error && isMissingControlTable(error)) return { ready: false, byId: new Map() };
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return {
    ready: true,
    byId: new Map(rows.map((row) => [String(row.user_id), row])),
  };
};

const fetchRecentAdminAudit = async (supabaseAdmin) => {
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("user_id,event,metadata,created_at")
    .ilike("event", "admin_%")
    .order("created_at", { ascending: false })
    .limit(RECENT_AUDIT_LIMIT);
  if (error) return { ready: false, rows: [] };
  return { ready: true, rows: data ?? [] };
};

const getUserLabel = (user, profile) => {
  if (!user) return "";
  const metadata = getUserMetadata(user);
  const firstName = String(profile?.first_name ?? metadata.first_name ?? "").trim();
  const lastName = String(profile?.last_name ?? metadata.last_name ?? "").trim();
  return [firstName, lastName].filter(Boolean).join(" ") || String(user?.email ?? "Usuario sin nombre");
};

const getAdminSource = (user, tableAdminIds) => {
  const configured = getConfiguredAdminSource(user);
  const fromEnv = configured.byUserId || configured.byEmail;
  const fromTable = tableAdminIds.has(String(user?.id ?? ""));
  if (fromEnv && fromTable) return "both";
  if (fromEnv) return "env";
  if (fromTable) return "table";
  return "";
};

const formatAccess = ({ user, tableAdminIds, control, currentAdminId }) => {
  const adminSource = getAdminSource(user, tableAdminIds);
  const bannedUntil = new Date(user?.banned_until ?? 0);
  const authIsBanned = !Number.isNaN(bannedUntil.getTime()) && bannedUntil.getTime() > Date.now();
  const status = control?.status === "suspended" || authIsBanned ? "suspended" : "active";
  return {
    is_admin: Boolean(adminSource),
    admin_source: adminSource,
    is_current_admin: String(user?.id ?? "") === String(currentAdminId ?? ""),
    status,
    is_suspended: status === "suspended",
    reason: status === "suspended" ? (control?.reason ?? "") : "",
    suspended_at: control?.suspended_at ?? "",
    updated_at: control?.updated_at ?? "",
    auth_banned_until: authIsBanned ? user.banned_until : "",
  };
};

const formatAuditRows = ({ rows, usersById, profilesById }) => rows.map((row) => {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const actorId = String(row?.user_id ?? "");
  const targetId = String(metadata.target_user_id ?? "");
  const actor = usersById.get(actorId);
  const target = usersById.get(targetId);
  return {
    event: String(row?.event ?? ""),
    created_at: row?.created_at ?? "",
    actor_user_id: actorId,
    actor_label: getUserLabel(actor, profilesById.get(actorId)),
    target_user_id: targetId,
    target_label: targetId ? getUserLabel(target, profilesById.get(targetId)) : "",
    action: String(metadata.action ?? ""),
    reason: String(metadata.reason ?? ""),
    status: String(metadata.status ?? ""),
    path: String(metadata.path ?? "").slice(0, 160),
  };
});

/** @type {import("astro").APIRoute} */
export const GET = async ({ request, url }) => {
  try {
    const rate = await checkRateLimit({
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

    const { users, directoryUsers, allUserIds, total } = await findUsers(supabaseAdmin, { query });
    const userIds = users.map((user) => String(user.id)).filter(Boolean);
    const usersById = new Map(directoryUsers.map((user) => [String(user.id), user]));
    const [adminRows, recentAudit] = await Promise.all([
      fetchAdminRows(supabaseAdmin),
      fetchRecentAdminAudit(supabaseAdmin),
    ]);
    const recentAuditRows = recentAudit.rows;
    const tableAdminIds = new Set(adminRows.map((row) => String(row.user_id ?? "")).filter(Boolean));
    const auditUserIds = recentAuditRows.flatMap((row) => [
      String(row?.user_id ?? ""),
      String(row?.metadata?.target_user_id ?? ""),
    ]).filter(Boolean);
    const relevantIds = unique([...userIds, ...allUserIds, ...tableAdminIds, ...auditUserIds]);
    const [profilesById, mpAccountsById, passwordResetsById, allMpAccountsById, controls] = await Promise.all([
      fetchProfiles(supabaseAdmin, userIds),
      fetchMercadoPagoAccounts(supabaseAdmin, userIds),
      fetchPasswordResetRequests(supabaseAdmin, userIds),
      fetchMercadoPagoAccounts(supabaseAdmin, allUserIds ?? []),
      fetchAccountControls(supabaseAdmin, relevantIds),
    ]);

    const missingProfileIds = relevantIds.filter((id) => !profilesById.has(id));
    const directoryProfilesById = new Map(profilesById);
    if (missingProfileIds.length) {
      const extraProfiles = await fetchProfiles(supabaseAdmin, missingProfileIds);
      for (const [id, profile] of extraProfiles) directoryProfilesById.set(id, profile);
    }

    const records = users.map((user) =>
      formatUser({
        user,
        profile: profilesById.get(String(user.id)),
        mpAccount: mpAccountsById.get(String(user.id)),
        passwordReset: passwordResetsById.get(String(user.id)),
        access: formatAccess({
          user,
          tableAdminIds,
          control: controls.byId.get(String(user.id)),
          currentAdminId: admin.user.id,
        }),
      }),
    );
    const connectedMercadoPago = countConnectedMercadoPagoAccounts(allMpAccountsById);
    const admins = directoryUsers
      .map((user) => {
        const source = getAdminSource(user, tableAdminIds);
        const access = formatAccess({
          user,
          tableAdminIds,
          control: controls.byId.get(String(user.id)),
          currentAdminId: admin.user.id,
        });
        return {
          id: String(user.id),
          email: user.email ?? "",
          label: getUserLabel(user, directoryProfilesById.get(String(user.id))),
          source,
          status: access.status,
        };
      })
      .filter((item) => item.source && item.status === "active")
      .sort((left, right) => left.label.localeCompare(right.label, "es"));

    return jsonResponse({
      ok: true,
      users: records,
      total,
      current_admin: {
        id: admin.user.id,
        source: admin.source,
      },
      controls_ready: controls.ready,
      audit_ready: recentAudit.ready,
      admins,
      recent_audit: formatAuditRows({
        rows: recentAuditRows,
        usersById,
        profilesById: directoryProfilesById,
      }),
      mercado_pago_summary: {
        total: allUserIds.length,
        connected: connectedMercadoPago,
        disconnected: Math.max(0, allUserIds.length - connectedMercadoPago),
        filtered: false,
      },
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "No se pudieron cargar los usuarios." }, 500);
  }
};
