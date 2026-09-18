import { supabase } from "../lib/supabaseClient";
import { isSafeInternalPath } from "../lib/internalNavigation";

let form = document.getElementById("new-password-form");
let passwordInput = document.getElementById("password");
let passwordConfirmInput = document.getElementById("password-confirm");
let submitButton = document.getElementById("new-password-submit");
let feedback = document.getElementById("new-password-feedback");

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_RULE_MESSAGE =
  "La contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 carácter especial y 1 número.";

const params = () => new URLSearchParams(window.location.search);
const sanitizeReturnTo = (value) => (isSafeInternalPath(value) ? value : "/login");
const getReturnTo = () => sanitizeReturnTo(params().get("returnTo"));

const bindElements = () => {
  form = document.getElementById("new-password-form");
  passwordInput = document.getElementById("password");
  passwordConfirmInput = document.getElementById("password-confirm");
  submitButton = document.getElementById("new-password-submit");
  feedback = document.getElementById("new-password-feedback");
};

const setFeedback = (message) => {
  if (feedback) feedback.textContent = message;
};

const bindEvents = () => {
  if (!form) return;
  if (form.dataset.abNewPasswordBound === "true") return;
  form.dataset.abNewPasswordBound = "true";
  form.addEventListener("submit", handleSubmit);
};

const validatePasswordStrength = (password) =>
  password.length >= PASSWORD_MIN_LENGTH
  && /[A-ZÁÉÍÓÚÑ]/.test(password)
  && /\d/.test(password)
  && /[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/.test(password);

const waitForRecoverySession = async () => {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.user) return true;

  return new Promise((resolve) => {
    let subscription;
    const timeout = window.setTimeout(() => {
      subscription?.unsubscribe();
      resolve(false);
    }, 2500);

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session?.user) {
        window.clearTimeout(timeout);
        subscription?.unsubscribe();
        resolve(true);
      }
    });

    subscription = listener.subscription;
  });
};

const handleSubmit = async (event) => {
  event.preventDefault();
  if (!passwordInput || !passwordConfirmInput || !feedback) return;

  const password = passwordInput.value;
  const passwordConfirm = passwordConfirmInput.value;

  if (!validatePasswordStrength(password)) {
    setFeedback(PASSWORD_RULE_MESSAGE);
    return;
  }

  if (password !== passwordConfirm) {
    setFeedback("Las contraseñas no coinciden.");
    return;
  }

  if (submitButton) submitButton.disabled = true;
  setFeedback("Guardando contraseña...");

  try {
    const hasSession = await waitForRecoverySession();
    if (!hasSession) {
      setFeedback("El enlace venció o no es válido. Pedí uno nuevo desde el login.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setFeedback("No se pudo guardar la contraseña. Pedí un enlace nuevo e intentá otra vez.");
      return;
    }

    setFeedback("Contraseña actualizada. Redirigiendo...");
    window.setTimeout(() => {
      window.location.replace(getReturnTo());
    }, 900);
  } catch (error) {
    setFeedback("No se pudo guardar la contraseña. Probá de nuevo en unos segundos.");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
};

bindElements();
bindEvents();
document.addEventListener("astro:page-load", () => {
  bindElements();
  bindEvents();
});
document.addEventListener("astro:after-swap", () => {
  bindElements();
  bindEvents();
});
window.addEventListener("pageshow", () => {
  bindElements();
  bindEvents();
});
