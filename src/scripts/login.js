/* Formulario de login con Supabase y feedback de UI. */
import { supabase } from "../lib/supabaseClient";
import { postAudit } from "./audit.js";

/* Referencias DOM (re-consultadas en navegación de Astro). */
let loginForm = document.getElementById("login-form");
let feedback = document.getElementById("login-feedback");
let emailInput = document.getElementById("email");
let passwordInput = document.getElementById("password");
let submitButton = document.getElementById("login-submit");

const bindLoginElements = () => {
  loginForm = document.getElementById("login-form");
  feedback = document.getElementById("login-feedback");
  emailInput = document.getElementById("email");
  passwordInput = document.getElementById("password");
  submitButton = document.getElementById("login-submit");
};

const bindLoginEvents = () => {
  if (!loginForm) return;
  if (loginForm.dataset.abLoginBound === "true") return;
  loginForm.dataset.abLoginBound = "true";
  loginForm.addEventListener("submit", handleLoginSubmit);
};

/* Sanitiza returnTo para evitar redirecciones externas. */
const params = new URLSearchParams(window.location.search);
const sanitizeReturnTo = (value) => {
  if (!value || typeof value !== "string") return "/";
  if (!value.startsWith("/")) return "/";
  if (value.includes("://")) return "/";
  return value;
};
const returnTo = sanitizeReturnTo(params.get("returnTo"));

/* Obtiene nombre visible desde metadata o email. */
const resolveDisplayName = (user) => {
  const meta = user?.user_metadata ?? {};
  const firstName = String(meta.first_name ?? "").trim();
  if (firstName) return firstName;
  const email = String(user?.email ?? "").trim();
  if (!email) return "usuario";
  return email.split("@")[0] || "usuario";
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/* Muestra modal de bienvenida por 4 segundos. */
const showWelcomeModal = (name) =>
  new Promise((resolve) => {
    const safeName = escapeHtml(name);
    const modal = document.createElement("div");
    modal.className = "ab-orders-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="ab-orders-modal__backdrop"></div>
      <div class="ab-orders-modal__panel ab-auth-welcome" role="document">
        <div class="ab-auth-welcome__mark" aria-hidden="true">
          <img src="/Logo_Final.webp" alt="" />
        </div>
        <h2>Hola, ${safeName}</h2>
        <p>Qué bueno verte de nuevo.</p>
      </div>
    `;
    document.body.appendChild(modal);
    window.setTimeout(() => {
      modal.remove();
      resolve();
    }, 4000);
  });

/* Wrapper con timeout para evitar esperas infinitas. */
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);

/* Submit del formulario: valida, autentica y redirige. */
const handleLoginSubmit = async (event) => {
  event.preventDefault();
  if (!emailInput || !passwordInput || !feedback) return;
  if (submitButton) submitButton.disabled = true;
  feedback.textContent = "Ingresando...";

  try {
    /* Autenticación con timeout por resiliencia. */
    const { data, error } = await withTimeout(
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

    /* Registro de auditoría y navegación posterior al login. */
    postAudit("login_success").catch(() => {});
    const displayName = resolveDisplayName(data?.user);
    feedback.textContent = `Listo. Bienvenido, ${displayName}.`;
    await showWelcomeModal(displayName);
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
};

/* Inicialización y eventos de navegación de Astro. */
bindLoginElements();
bindLoginEvents();
document.addEventListener("astro:page-load", () => {
  bindLoginElements();
  bindLoginEvents();
});
document.addEventListener("astro:after-swap", () => {
  bindLoginElements();
  bindLoginEvents();
});
window.addEventListener("pageshow", () => {
  bindLoginElements();
  bindLoginEvents();
});
