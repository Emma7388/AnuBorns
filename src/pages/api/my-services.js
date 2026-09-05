/* API temporal de servicios del usuario: persistencia simple en Supabase. */
import { jsonResponse } from "../../lib/apiResponse.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";
import { checkRateLimit } from "../../lib/serverRateLimit.js";

/* Datos de muestra cuando el usuario todavía no guardó servicios. */
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

/* Devuelve servicios guardados o datos de muestra iniciales. */
export const GET = async ({ request }) => {
  try {
    const rate = checkRateLimit({ request, routeKey: "my-services-get", windowMs: 60_000, max: 60 });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);

    const auth = await getAuthenticatedUser(supabaseAdmin, request);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const userId = auth.user.id;
    const { data, error } = await supabaseAdmin
      .from("user_services")
      .select("active, history")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return jsonResponse({ error: "No se pudieron cargar servicios." }, 500);
    if (!data) {
      return jsonResponse({ active: seedData.active, history: seedData.history });
    }

    return jsonResponse({
      active: data?.active ?? null,
      history: Array.isArray(data?.history) ? data.history : [],
    });
  } catch {
    return jsonResponse({ error: "No se pudieron cargar servicios." }, 500);
  }
};

/* Guarda el estado de servicios para el usuario autenticado. */
export const PUT = async ({ request }) => {
  try {
    const rate = checkRateLimit({ request, routeKey: "my-services-put", windowMs: 60_000, max: 30 });
    if (!rate.allowed) {
      return jsonResponse({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ error: "Servicio no disponible." }, 503);

    const auth = await getAuthenticatedUser(supabaseAdmin, request);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "Los datos de servicios no son válidos." }, 400);
    }
    const shouldReset = Boolean(payload?.reset);
    const active = shouldReset ? seedData.active : (payload?.active ?? null);
    const history = shouldReset ? seedData.history : (Array.isArray(payload?.history) ? payload.history : []);

    const { error } = await supabaseAdmin.from("user_services").upsert(
      { user_id: auth.user.id, active, history },
      { onConflict: "user_id" },
    );

    if (error) return jsonResponse({ error: "No se pudieron guardar servicios." }, 500);
    return jsonResponse({ ok: true, active, history });
  } catch {
    return jsonResponse({ error: "No se pudieron guardar servicios." }, 500);
  }
};
