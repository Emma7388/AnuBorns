import { supabase } from "../lib/supabaseClient";

const feedback = document.getElementById("auth-callback-feedback");

const sanitizeReturnTo = (value) => {
  if (!value || typeof value !== "string") return "/mis-datos";
  if (!value.startsWith("/")) return "/mis-datos";
  if (value.includes("://")) return "/mis-datos";
  return value;
};

const params = new URLSearchParams(window.location.search);
const returnTo = sanitizeReturnTo(params.get("returnTo"));

const setFeedback = (message) => {
  if (feedback) feedback.textContent = message;
};

const completeAuthCallback = async () => {
  setFeedback("Confirmando acceso...");

  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      setFeedback("No se pudo confirmar la sesión. Iniciá sesión manualmente.");
      return;
    }
  }

  const { data } = await supabase.auth.getSession();
  if (!data?.session?.user) {
    setFeedback("La verificación se completó, pero falta iniciar sesión.");
    window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }

  /* Señal para refrescar sesión en otras pestañas activas. */
  window.localStorage.setItem("ab_auth_refresh", String(Date.now()));
  setFeedback("Cuenta verificada. Redirigiendo...");
  window.location.replace(returnTo);
};

completeAuthCallback().catch(() => {
  setFeedback("No se pudo completar la verificación. Probá iniciar sesión.");
});
