/* Cliente: envío de eventos de auditoría al backend. */
import { supabase } from "../lib/supabaseClient";

/* Endpoint interno para logs. */
const AUDIT_ENDPOINT = "/api/audit";

/* Envía un evento con metadata contextual. */
export const postAudit = async (event, metadata = {}) => {
  try {
    /* Se requiere sesión para firmar la solicitud. */
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;

    /* Envío best-effort (keepalive para no bloquear navegación). */
    await fetch(AUDIT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event,
        metadata: {
          ...metadata,
          path: window.location.pathname,
          source: "client",
        },
      }),
      keepalive: true,
    });
  } catch {
    // noop
  }
};
