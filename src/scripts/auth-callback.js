import { supabase } from "../lib/supabaseClient";

let feedback = document.getElementById("auth-callback-feedback");

const sanitizeReturnTo = (value) => {
  if (!value || typeof value !== "string") return "/mis-datos";
  if (!value.startsWith("/")) return "/mis-datos";
  if (value.includes("://")) return "/mis-datos";
  return value;
};
const getParams = () => new URLSearchParams(window.location.search);
const getReturnTo = () => sanitizeReturnTo(getParams().get("returnTo"));

const bindAuthCallbackElements = () => {
  feedback = document.getElementById("auth-callback-feedback");
};

const setFeedback = (message) => {
  if (feedback) feedback.textContent = message;
};

const completeAuthCallback = async () => {
  bindAuthCallbackElements();
  setFeedback("Confirmando acceso...");

  const code = getParams().get("code");
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
    window.location.replace(`/login?returnTo=${encodeURIComponent(getReturnTo())}`);
    return;
  }

  /* Señal para refrescar sesión en otras pestañas activas. */
  window.localStorage.setItem("ab_auth_refresh", String(Date.now()));
  setFeedback("Cuenta verificada. Redirigiendo...");
  window.location.replace(getReturnTo());
};

/* Inicialización y eventos de navegación de Astro. */
bindAuthCallbackElements();
completeAuthCallback().catch(() => {
  setFeedback("No se pudo completar la verificación. Probá iniciar sesión.");
});
document.addEventListener("astro:page-load", () => {
  bindAuthCallbackElements();
  completeAuthCallback().catch(() => {
    setFeedback("No se pudo completar la verificación. Probá iniciar sesión.");
  });
});
document.addEventListener("astro:after-swap", () => {
  bindAuthCallbackElements();
  completeAuthCallback().catch(() => {
    setFeedback("No se pudo completar la verificación. Probá iniciar sesión.");
  });
});
window.addEventListener("pageshow", () => {
  bindAuthCallbackElements();
  completeAuthCallback().catch(() => {
    setFeedback("No se pudo completar la verificación. Probá iniciar sesión.");
  });
});
