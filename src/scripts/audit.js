import { supabase } from "../lib/supabaseClient";

const AUDIT_ENDPOINT = "/api/audit";

export const postAudit = async (event, metadata = {}) => {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;

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
