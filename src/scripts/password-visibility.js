const SHOW_ICON = "/icons/ojo.svg";
const HIDE_ICON = "/icons/ojo-cerrado.svg";

const resolveLabel = (input) => {
  const label = input?.id
    ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent?.trim()
    : "";
  return label?.toLowerCase().includes("confirm")
    ? "confirmación de contraseña"
    : "contraseña";
};

const syncPasswordToggle = (button, input, isVisible) => {
  const label = resolveLabel(input);
  const action = isVisible ? "Ocultar" : "Mostrar";
  const icon = button.querySelector("img");
  button.setAttribute("aria-label", `${action} ${label}`);
  button.setAttribute("title", `${action} ${label}`);
  button.setAttribute("aria-pressed", String(isVisible));
  if (icon) icon.src = isVisible ? HIDE_ICON : SHOW_ICON;
};

const bindPasswordVisibility = () => {
  document.querySelectorAll("[data-password-visibility]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.dataset.abPasswordVisibilityBound === "true") return;
    const inputId = button.dataset.passwordVisibility;
    const input = inputId ? document.getElementById(inputId) : null;
    if (!(input instanceof HTMLInputElement)) return;

    button.dataset.abPasswordVisibilityBound = "true";
    syncPasswordToggle(button, input, input.type === "text");
    button.addEventListener("click", () => {
      const shouldShow = input.type === "password";
      input.type = shouldShow ? "text" : "password";
      syncPasswordToggle(button, input, shouldShow);
      input.focus();
    });
  });
};

bindPasswordVisibility();
document.addEventListener("astro:page-load", bindPasswordVisibility);
document.addEventListener("astro:after-swap", bindPasswordVisibility);
window.addEventListener("pageshow", bindPasswordVisibility);
