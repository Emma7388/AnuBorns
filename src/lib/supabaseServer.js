/* Cliente Supabase para entorno servidor. */
import { createClient } from "@supabase/supabase-js";

/* Cache en memoria para evitar re-crear el cliente en cada request. */
let cachedAdmin = null;
let warnedMissingConfig = false;

/* Normaliza URL de Supabase a origen base (sin /rest/v1 ni slash final). */
const normalizeSupabaseUrl = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return raw
      .replace(/\/rest\/v1\/?$/i, "")
      .replace(/\/+$/, "");
  }
};

export const getSupabaseAdminConfigStatus = () => {
  const env = import.meta.env ?? {};
  const rawSupabaseUrl =
    process.env.SUPABASE_URL ??
    env.SUPABASE_URL ??
    process.env.PUBLIC_SUPABASE_URL ??
    env.PUBLIC_SUPABASE_URL;
  const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!supabaseServiceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  return {
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasServiceRoleKey: Boolean(supabaseServiceKey),
    missing,
    supabaseUrl,
    supabaseServiceKey,
  };
};

/* Devuelve un cliente administrador usando la service role key. */
export const getSupabaseAdmin = () => {
  if (cachedAdmin) return cachedAdmin;
  const config = getSupabaseAdminConfigStatus();
  /* Si falta configuración, se responde null y el caller maneja el error. */
  if (config.missing.length > 0) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.error("[supabaseServer] Missing server env configuration.", {
        hasSupabaseUrl: config.hasSupabaseUrl,
        hasServiceRoleKey: config.hasServiceRoleKey,
        missing: config.missing,
      });
    }
    return null;
  }
  /* Cliente sin persistencia de sesión (server-side). */
  cachedAdmin = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedAdmin;
};
