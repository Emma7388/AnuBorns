/* API: registrar eventos de auditoría en Supabase. */
import { getSupabaseAdmin } from "../../lib/supabaseServer";

/* Límites de seguridad para evitar payloads excesivos. */
const MAX_EVENT_LENGTH = 64;
const MAX_METADATA_SIZE = 8_000;

/* Intenta detectar IP real detrás de proxies comunes. */
const getClientIp = (request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    null
  );
};

/* Calcula tamaño JSON de forma segura para validar metadata. */
const safeJsonSize = (value) => {
  try {
    return JSON.stringify(value ?? {}).length;
  } catch {
    return 0;
  }
};

/** @type {import("astro").APIRoute} */
export const POST = async ({ request }) => {
  try {
    /* Validación de configuración y autenticación. */
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ error: "Servicio no disponible." }), { status: 503 });
    }
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado." }), { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Sesión inválida." }), { status: 401 });
    }

    /* Normaliza y valida payload. */
    const payload = await request.json();
    const event = String(payload?.event ?? "").trim();
    const metadata = payload?.metadata ?? {};

    if (!event || event.length > MAX_EVENT_LENGTH) {
      return new Response(JSON.stringify({ error: "Evento inválido." }), { status: 400 });
    }

    if (safeJsonSize(metadata) > MAX_METADATA_SIZE) {
      return new Response(JSON.stringify({ error: "Metadata demasiado grande." }), { status: 400 });
    }

    /* Contexto adicional para el registro de auditoría. */
    const userAgent = request.headers.get("user-agent") ?? "";
    const ipAddress = getClientIp(request);

    /* Inserta el evento en la tabla de auditoría. */
    const { error: insertError } = await supabaseAdmin.from("audit_logs").insert({
      user_id: userData.user.id,
      event,
      metadata,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: "No se pudo guardar el evento." }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Error inesperado." }), { status: 500 });
  }
};
