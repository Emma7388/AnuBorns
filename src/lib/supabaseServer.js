/* Cliente Supabase para entorno servidor. */
import { createClient } from "@supabase/supabase-js";

/* Cache en memoria para evitar re-crear el cliente en cada request. */
let cachedAdmin = null;

/* Devuelve un cliente administrador usando la service role key. */
export const getSupabaseAdmin = () => {
  if (cachedAdmin) return cachedAdmin;
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  /* Si falta configuración, se responde null y el caller maneja el error. */
  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }
  /* Cliente sin persistencia de sesión (server-side). */
  cachedAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedAdmin;
};
