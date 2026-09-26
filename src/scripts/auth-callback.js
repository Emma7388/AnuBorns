import { supabase } from "../lib/supabaseClient";
import { isSafeInternalPath } from "../lib/internalNavigation";
import { resolvePendingRegistrationProfile } from "../lib/userProfile";

let feedback = document.getElementById("auth-callback-feedback");
let isCompletingAuthCallback = false;

const sanitizeReturnTo = (value) => (isSafeInternalPath(value) ? value : "/mis-datos");
const getParams = () => new URLSearchParams(window.location.search);
const getReturnTo = () => sanitizeReturnTo(getParams().get("returnTo"));
const getHashParams = () => new URLSearchParams(window.location.hash.replace(/^#/, ""));
const isPasswordRecoveryCallback = () => {
  const searchParams = getParams();
  const hashParams = getHashParams();
  const type = searchParams.get("type") || hashParams.get("type");
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
  return type === "recovery" || returnTo.startsWith("/nueva-contrasena");
};
const getPasswordRecoveryHref = () => {
  const rawReturnTo = getParams().get("returnTo");
  const returnTo = isSafeInternalPath(rawReturnTo) ? rawReturnTo : "/login";
  const url = new URL("/nueva-contrasena", window.location.origin);
  url.searchParams.set("returnTo", returnTo === "/nueva-contrasena" ? "/login" : returnTo);
  return `${url.pathname}${url.search}`;
};

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

    if (isPasswordRecoveryCallback()) {
      setFeedback("Enlace verificado. Redirigiendo para crear una contraseÃ±a nueva...");
      window.location.replace(getPasswordRecoveryHref());
      return;
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
