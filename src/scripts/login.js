/* Formulario de login con Supabase y feedback de UI. */
import { supabase } from "../lib/supabaseClient";
import { postAudit } from "./audit.js";

/* Referencias DOM. */
const loginForm = document.getElementById("login-form");
const feedback = document.getElementById("login-feedback");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("login-submit");

/* Sanitiza returnTo para evitar redirecciones externas. */
const params = new URLSearchParams(window.location.search);
const sanitizeReturnTo = (value) => {
  if (!value || typeof value !== "string") return "/mis-datos";
  if (!value.startsWith("/")) return "/mis-datos";
  if (value.includes("://")) return "/mis-datos";
  return value;
};
const returnTo = sanitizeReturnTo(params.get("returnTo"));

/* Wrapper con timeout para evitar esperas infinitas. */
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);

/* Submit del formulario: valida, autentica y redirige. */
loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!emailInput || !passwordInput || !feedback) return;
  if (submitButton) submitButton.disabled = true;
  feedback.textContent = "Ingresando...";

  try {
    /* Auth con timeout por resiliencia. */
    const { error } = await withTimeout(
      supabase.auth.signInWithPassword({
        email: emailInput.value,
        password: passwordInput.value,
      }),
      12000
    );

    if (error) {
      feedback.textContent = "Credenciales inválidas.";
      return;
    }

    /* Log de auditoría y navegación post-login. */
    postAudit("login_success").catch(() => {});
    feedback.textContent = "Listo. Redirigiendo...";
    window.location.replace(returnTo);
  } catch (err) {
    const message =
      err instanceof Error && err.message === "timeout"
        ? "No se pudo conectar. Probá de nuevo en unos segundos."
        : "No se pudo iniciar sesión. Probá de nuevo.";
    feedback.textContent = message;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});
