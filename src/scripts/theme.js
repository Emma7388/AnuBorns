/* Tema global: claro por defecto, oscuro persistido por usuario. */
const THEME_STORAGE_KEY = "ab_theme";

const getCurrentTheme = () => {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
};

const saveTheme = (theme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignora errores de almacenamiento privado o bloqueado.
  }
};

const applyTheme = (theme) => {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;
  updateThemeToggles(nextTheme);
};

const updateThemeToggles = (theme = getCurrentTheme()) => {
  const isDark = theme === "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.setAttribute("aria-label", isDark ? "Activar modo claro" : "Activar modo oscuro");
    const label = toggle.querySelector("[data-theme-label]");
    if (label) label.textContent = "";
  });
};

const initTheme = () => {
  const initialTheme = getCurrentTheme();
  applyTheme(initialTheme);

  document.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
    if (toggle.dataset.themeBound === "true") return;
    toggle.addEventListener("click", () => {
      const nextTheme = getCurrentTheme() === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      saveTheme(nextTheme);
    });
    toggle.dataset.themeBound = "true";
  });
};

initTheme();
document.addEventListener("astro:page-load", initTheme);
document.addEventListener("astro:after-swap", initTheme);
window.addEventListener("pageshow", initTheme);
