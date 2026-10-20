/* Integración mínima con Cloudflare Turnstile y Supabase Auth CAPTCHA. */
const responseSelector = '[name="cf-turnstile-response"]';

export const getCaptchaToken = (form) => {
  const enabled = form?.dataset?.turnstileEnabled === "true";
  if (!enabled) return { enabled: false, ok: true, token: undefined };

  const token = String(form.querySelector(responseSelector)?.value ?? "").trim();
  return {
    enabled: true,
    ok: Boolean(token),
    token: token || undefined,
  };
};

export const resetCaptcha = (form) => {
  if (form?.dataset?.turnstileEnabled !== "true") return;
  const widget = form.querySelector(".cf-turnstile");
  try {
    if (window.turnstile && widget) window.turnstile.reset();
  } catch {
    // El widget puede estar recreándose durante una navegación de Astro.
  }
};
