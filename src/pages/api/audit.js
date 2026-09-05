/* API: registrar eventos de auditoría en Supabase. */
import { jsonResponse } from "../../lib/apiResponse.js";
import { getClientIp } from "../../lib/requestMeta.js";
import { getAuthenticatedUser } from "../../lib/serverAuth.js";
import { getSupabaseAdmin } from "../../lib/supabaseServer.js";

/* Límites de seguridad para evitar payloads excesivos. */
const MAX_EVENT_LENGTH = 64;
const MAX_METADATA_SIZE = 8_000;

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
      return jsonResponse({ error: "Servicio no disponible." }, 503);
    }
    const auth = await getAuthenticatedUser(supabaseAdmin, request);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    /* Normaliza y valida payload. */
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "Payload inválido." }, 400);
    }
    const event = String(payload?.event ?? "").trim();
    const metadata = payload?.metadata ?? {};

    if (!event || event.length > MAX_EVENT_LENGTH) {
      return jsonResponse({ error: "Evento inválido." }, 400);
    }

    if (safeJsonSize(metadata) > MAX_METADATA_SIZE) {
      return jsonResponse({ error: "Metadata demasiado grande." }, 400);
    }

    /* Contexto adicional para el registro de auditoría. */
    const userAgent = request.headers.get("user-agent") ?? "";
    const ipAddress = getClientIp(request);

    /* Inserta el evento en la tabla de auditoría. */
    const { error: insertError } = await supabaseAdmin.from("audit_logs").insert({
      user_id: auth.user.id,
      event,
      metadata,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    if (insertError) {
      return jsonResponse({ error: "No se pudo guardar el evento." }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Error inesperado." }, 500);
  }
};
