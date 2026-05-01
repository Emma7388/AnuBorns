import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";

const seedData = {
  active: {
    title: "Reparación de aire acondicionado",
    professional: "Martin Lozano",
    startDate: "16 Mar 2026, 10:30",
    location: "Palermo, CABA",
  },
  history: [
    { title: "Pintura de living", professional: "Camila Rojas", date: "02 Mar 2026", rating: "4.8" },
    { title: "Revisión eléctrica", professional: "Pablo Ortega", date: "18 Feb 2026", rating: "5.0" },
    { title: "Reparación de cañería", professional: "Lucia Marquez", date: "27 Ene 2026", rating: "4.6" },
  ],
};

const getPublicAuthClient = () => {
  const env = import.meta.env ?? {};
  const url =
    process.env.PUBLIC_SUPABASE_URL ??
    env.PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    env.SUPABASE_URL;
  const anonKey =
    process.env.PUBLIC_SUPABASE_ANON_KEY ??
    env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const getSellerFromToken = async (request) => {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null, error: "No autorizado.", status: 401 };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const authClient = getPublicAuthClient();
  if (!authClient) {
    return { user: null, error: "Servicio no disponible.", status: 503 };
  }
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null, error: "Sesion invalida o expirada.", status: 401 };
  }
  return { user: data.user, error: "", status: 200 };
};

export const GET = async ({ request }) => {
  try {
    const rate = checkRateLimit({ request, routeKey: "my-services-get", windowMs: 60_000, max: 60 });
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }), { status: 429 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return new Response(JSON.stringify({ error: "Servicio no disponible." }), { status: 503 });

    const auth = await getSellerFromToken(request);
    if (!auth.user) return new Response(JSON.stringify({ error: auth.error }), { status: auth.status });

    const userId = auth.user.id;
    const { data, error } = await supabaseAdmin
      .from("user_services")
      .select("active, history")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return new Response(JSON.stringify({ error: "No se pudieron cargar servicios." }), { status: 500 });
    if (!data) {
      return new Response(JSON.stringify({ active: seedData.active, history: seedData.history }), { status: 200 });
    }

    return new Response(
      JSON.stringify({
        active: data?.active ?? null,
        history: Array.isArray(data?.history) ? data.history : [],
      }),
      { status: 200 },
    );
  } catch {
    return new Response(JSON.stringify({ error: "No se pudieron cargar servicios." }), { status: 500 });
  }
};

export const PUT = async ({ request }) => {
  try {
    const rate = checkRateLimit({ request, routeKey: "my-services-put", windowMs: 60_000, max: 30 });
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }), { status: 429 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return new Response(JSON.stringify({ error: "Servicio no disponible." }), { status: 503 });

    const auth = await getSellerFromToken(request);
    if (!auth.user) return new Response(JSON.stringify({ error: auth.error }), { status: auth.status });

    const payload = await request.json().catch(() => ({}));
    const shouldReset = Boolean(payload?.reset);
    const active = shouldReset ? seedData.active : (payload?.active ?? null);
    const history = shouldReset ? seedData.history : (Array.isArray(payload?.history) ? payload.history : []);

    const { error } = await supabaseAdmin.from("user_services").upsert(
      { user_id: auth.user.id, active, history },
      { onConflict: "user_id" },
    );

    if (error) return new Response(JSON.stringify({ error: "No se pudieron guardar servicios." }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, active, history }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: "No se pudieron guardar servicios." }), { status: 500 });
  }
};
