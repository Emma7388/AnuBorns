import { supabase } from "./supabaseClient";

export const PENDING_PROFILE_KEY = "ab_pending_profile";
const PENDING_PROFILE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 2;
const PROFILE_CACHE_TTL_MS = 5000;
const PROFILE_SELECT =
  "user_id, first_name, last_name, phone, dni, address, city, province, postal_code, updated_at";

const EMPTY_PROFILE = {
  first_name: "",
  last_name: "",
  phone: "",
  dni: "",
  address: "",
  city: "",
  province: "",
  postal_code: "",
  updated_at: "",
};

const normalizeProfileValue = (value) => String(value ?? "").trim();
const profileCache = new Map();
const profileRequests = new Map();

const getProfileCacheKey = (userId) => String(userId ?? "").trim();

export const invalidateUserProfileCache = (userId = "") => {
  const key = getProfileCacheKey(userId);
  if (!key) {
    profileCache.clear();
    profileRequests.clear();
    return;
  }
  profileCache.delete(key);
  profileRequests.delete(key);
};

export const normalizeUserProfile = (values = {}) => ({
  first_name: normalizeProfileValue(values.first_name ?? values.firstName),
  last_name: normalizeProfileValue(values.last_name ?? values.lastName),
  phone: normalizeProfileValue(values.phone),
  dni: normalizeProfileValue(values.dni),
  address: normalizeProfileValue(values.address),
  city: normalizeProfileValue(values.city),
  province: normalizeProfileValue(values.province),
  postal_code: normalizeProfileValue(values.postal_code ?? values.postalCode),
});

export const getMetadataProfile = (user) => {
  const metadata = user?.user_metadata ?? {};
  return normalizeUserProfile(metadata);
};

export const clearPendingRegistrationProfile = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PENDING_PROFILE_KEY);
};

export const savePendingRegistrationProfile = (values) => {
  if (typeof window === "undefined") return;
  const payload = {
    values: normalizeUserProfile(values),
    savedAt: Date.now(),
  };
  window.localStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(payload));
};

const readPendingRegistrationProfile = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_PROFILE_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw);
    const savedAt = Number(pending?.savedAt ?? 0);
    if (!savedAt || Date.now() - savedAt > PENDING_PROFILE_MAX_AGE_MS) {
      clearPendingRegistrationProfile();
      return null;
    }
    const values = normalizeUserProfile(pending?.values ?? {});
    if (!values.first_name || !values.last_name || !values.phone || !values.dni || !values.address || !values.city) {
      clearPendingRegistrationProfile();
      return null;
    }
    return values;
  } catch {
    clearPendingRegistrationProfile();
    return null;
  }
};

export const upsertUserProfile = async (userId, values) => {
  const profile = normalizeUserProfile(values);
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, ...profile }, { onConflict: "user_id" })
    .select(PROFILE_SELECT)
    .single();
  if (error) return { data: null, error };
  invalidateUserProfileCache(userId);
  return { data: { ...EMPTY_PROFILE, ...data }, error: null };
};

export const fetchUserProfile = async (user) => {
  const userId = user?.id ?? user?.user?.id ?? "";
  const authUser = user?.user ?? user;
  const fallback = { ...EMPTY_PROFILE, ...getMetadataProfile(authUser) };
  if (!userId) return fallback;

  const cacheKey = getProfileCacheKey(userId);
  const cached = profileCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PROFILE_CACHE_TTL_MS) {
    return { ...fallback, ...cached.profile };
  }

  const pending = profileRequests.get(cacheKey);
  if (pending) return pending;

  const request = supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("user_id", userId)
    .maybeSingle()
    .then(({ data, error }) => {
      const profile = error || !data ? fallback : { ...fallback, ...data };
      profileCache.set(cacheKey, { fetchedAt: Date.now(), profile });
      return profile;
    })
    .catch(() => fallback)
    .finally(() => {
      profileRequests.delete(cacheKey);
    });

  profileRequests.set(cacheKey, request);
  return request;
};

export const resolvePendingRegistrationProfile = async (session) => {
  const userId = session?.user?.id ?? "";
  if (!userId) return { ok: true, profile: null };
  const pending = readPendingRegistrationProfile();
  if (!pending) return { ok: true, profile: null };

  const { data, error } = await upsertUserProfile(userId, pending);
  if (error) return { ok: false, profile: null, error: error.message };
  clearPendingRegistrationProfile();
  return { ok: true, profile: data };
};

export const getDisplayNameFromProfile = (user, profile = {}) => {
  const firstName = String(profile?.first_name ?? "").trim();
  if (firstName) return firstName;
  const metadataFirstName = String(user?.user_metadata?.first_name ?? "").trim();
  if (metadataFirstName) return metadataFirstName;
  const email = String(user?.email ?? "").trim();
  if (!email) return "";
  return email.split("@")[0] || email;
};
