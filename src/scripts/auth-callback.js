import { supabase } from "../lib/supabaseClient";
import { isSafeInternalPath } from "../lib/internalNavigation";
import { resolvePendingRegistrationProfile } from "../lib/userProfile";

let feedback = document.getElementById("auth-callback-feedback");
let isCompletingAuthCallback = false;

const sanitizeReturnTo = (value) => (isSafeInternalPath(value) ? value : "/mis-datos");
const getParams = () => new URLSearchParams(window.location.search);
const getReturnTo = () => sanitizeReturnTo(getParams().get("returnTo"));

const bindAuthCallbackElements = () => {
  feedback = document.getElementById("auth-callback-feedback");
};

const setFeedback = (message) => {
  if (feedback) feedback.textContent = message;
};

const completeAuthCallback = async () => {
  if (isCompletingAuthCallback) return;
  isCompletingAuthCallback = true;
  bindAuthCallbackElements();
  setFeedback("Confirmando acceso...");

  try {
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

    await resolvePendingRegistrationProfile(data.session).catch(() => ({ ok: false }));

    /* Señal para refrescar sesión en otras pestañas activas. */
    window.localStorage.setItem("ab_auth_refresh", String(Date.now()));
    setFeedback("Cuenta verificada. Redirigiendo...");
    window.location.replace(getReturnTo());
  } finally {
    isCompletingAuthCallback = false;
  }
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
