/* Formulario de login con Supabase y feedback de UI. */
import { supabase } from "../lib/supabaseClient";
import { isSafeInternalPath } from "../lib/internalNavigation";
import { postAudit } from "./audit.js";
import {
  fetchUserProfile,
  getDisplayNameFromProfile,
  resolvePendingRegistrationProfile,
} from "../lib/userProfile";

/* Referencias DOM (re-consultadas en navegación de Astro). */
let loginForm = document.getElementById("login-form");
let feedback = document.getElementById("login-feedback");
let emailInput = document.getElementById("email");
let passwordInput = document.getElementById("password");
let submitButton = document.getElementById("login-submit");
let forgotPasswordButton = document.getElementById("forgot-password");

const bindLoginElements = () => {
  loginForm = document.getElementById("login-form");
  feedback = document.getElementById("login-feedback");
  emailInput = document.getElementById("email");
  passwordInput = document.getElementById("password");
  submitButton = document.getElementById("login-submit");
  forgotPasswordButton = document.getElementById("forgot-password");
};

const bindLoginEvents = () => {
  if (!loginForm) return;
  if (loginForm.dataset.abLoginBound === "true") return;
  loginForm.dataset.abLoginBound = "true";
  loginForm.addEventListener("submit", handleLoginSubmit);
};

const bindForgotPasswordEvent = () => {
  if (!forgotPasswordButton) return;
  if (forgotPasswordButton.dataset.abForgotBound === "true") return;
  forgotPasswordButton.dataset.abForgotBound = "true";
  forgotPasswordButton.addEventListener("click", handleForgotPassword);
};

/* Sanitiza returnTo para evitar redirecciones externas. */
const sanitizeReturnTo = (value) => (isSafeInternalPath(value) ? value : "/");
const getReturnTo = () =>
  sanitizeReturnTo(new URLSearchParams(window.location.search).get("returnTo"));

const getRecoveryRedirectUrl = () => {
  const url = new URL("/nueva-contrasena", window.location.origin);
  url.searchParams.set("returnTo", getReturnTo());
  return url.toString();
};

/* Obtiene nombre visible desde metadata o email. */
const resolveDisplayName = async (session) => {
  await resolvePendingRegistrationProfile(session).catch(() => ({ ok: false }));
  const profile = await fetchUserProfile(session?.user);
  return getDisplayNameFromProfile(session?.user, profile) || "usuario";
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/* Muestra modal de bienvenida por 4 segundos. */
const showWelcomeModal = (name, avatarUrl) =>
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
          <span class="ab-auth-welcome__initial">${escapeHtml(String(name).trim().charAt(0).toUpperCase() || "U")}</span>
        </div>
        <h2 class="ab-auth-welcome__title">
          <span class="ab-auth-welcome__greeting">Hola,</span>
          <span class="ab-auth-welcome__name">${safeName}</span>
        </h2>
        <p>Qué bueno verte de nuevo.</p>
      </div>
    `;
    const mark = modal.querySelector(".ab-auth-welcome__mark");
    if (avatarUrl && mark) {
      const avatar = document.createElement("img");
      avatar.alt = "";
      avatar.addEventListener("load", () => {
        mark.querySelector(".ab-auth-welcome__initial")?.remove();
      });
      avatar.addEventListener("error", () => avatar.remove());
      avatar.src = avatarUrl;
      mark.appendChild(avatar);
    }
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

const handleForgotPassword = async () => {
  if (!emailInput || !feedback) return;
  const email = emailInput.value.trim();

  if (!email) {
    feedback.textContent = "Ingresá tu email y te mandamos el enlace para recuperar la contraseña.";
    emailInput.focus();
    return;
  }

  if (forgotPasswordButton) forgotPasswordButton.disabled = true;
  feedback.textContent = "Enviando enlace de recuperación...";

  try {
    const { error } = await withTimeout(
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getRecoveryRedirectUrl(),
      }),
      12000
    );

    if (error) {
      feedback.textContent = "No se pudo enviar el enlace. Revisá el email e intentá de nuevo.";
      return;
    }

    feedback.textContent = "Listo. Si el email existe, vas a recibir un enlace para crear una contraseña nueva.";
  } catch (err) {
    feedback.textContent = "No se pudo enviar el enlace. Probá de nuevo en unos segundos.";
  } finally {
    if (forgotPasswordButton) forgotPasswordButton.disabled = false;
  }
};

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
    const displayName = await resolveDisplayName(data?.session ?? { user: data?.user });
    feedback.textContent = `Listo. Bienvenido, ${displayName}.`;
    await showWelcomeModal(displayName, data?.session?.user?.user_metadata?.avatar_url || data?.user?.user_metadata?.avatar_url);
    window.location.replace(getReturnTo());
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
bindForgotPasswordEvent();
document.addEventListener("astro:page-load", () => {
  bindLoginElements();
  bindLoginEvents();
  bindForgotPasswordEvent();
});
document.addEventListener("astro:after-swap", () => {
  bindLoginElements();
  bindLoginEvents();
  bindForgotPasswordEvent();
});
window.addEventListener("pageshow", () => {
  bindLoginElements();
  bindLoginEvents();
  bindForgotPasswordEvent();
});
