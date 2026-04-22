/* Cliente Supabase para el navegador. */
import { createClient } from "@supabase/supabase-js";

/* Variables públicas requeridas para inicializar Supabase. */
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/* Validación temprana para evitar fallas silenciosas. */
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase public environment variables.");
}

/* Cliente configurado para mantener sesión activa. */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
