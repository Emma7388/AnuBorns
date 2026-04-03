import { supabase } from "../lib/supabaseClient";

const loginForm = document.getElementById("login-form");
const feedback = document.getElementById("login-feedback");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const params = new URLSearchParams(window.location.search);
const returnTo = params.get("returnTo") || "/mis-datos";

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!emailInput || !passwordInput || !feedback) return;
  feedback.textContent = "Ingresando...";

  const { error } = await supabase.auth.signInWithPassword({
    email: emailInput.value,
    password: passwordInput.value,
  });

  if (error) {
    feedback.textContent = `Error: ${error.message}`;
    return;
  }

  feedback.textContent = "Listo. Redirigiendo...";
  window.location.replace(returnTo);
});
