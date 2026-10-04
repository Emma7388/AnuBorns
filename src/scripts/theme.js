/* Tema global: claro u oscuro. */
const THEME_STORAGE_KEY = "ab_theme";
const THEMES = ["light", "dark"];

const normalizeTheme = (theme) => (THEMES.includes(theme) ? theme : "light");

const getCurrentTheme = () => {
  return normalizeTheme(document.documentElement.dataset.theme);
};

const getSavedTheme = () => {
  try {
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return getCurrentTheme();
  }
};

const saveTheme = (theme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignora errores de almacenamiento privado o bloqueado.
  }
};

const applyTheme = (theme) => {
  const nextTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme === "light" ? "light" : "dark";
  updateThemeToggles(nextTheme);
};

const applyThemeToDocument = (targetDocument, theme = getSavedTheme()) => {
  const nextTheme = normalizeTheme(theme);
  targetDocument.documentElement.dataset.theme = nextTheme;
  targetDocument.documentElement.style.colorScheme = nextTheme === "light" ? "light" : "dark";
};

const updateThemeToggles = (theme = getCurrentTheme()) => {
  const nextThemeIndex = (THEMES.indexOf(theme) + 1) % THEMES.length;
  const nextTheme = THEMES[nextThemeIndex];
  const nextThemeLabel = {
    light: "claro",
    dark: "oscuro",
  }[nextTheme];

  document.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
    toggle.dataset.theme = theme;
    toggle.setAttribute("aria-pressed", String(theme !== "light"));
    toggle.setAttribute("aria-label", `Activar tema ${nextThemeLabel}`);
    toggle.setAttribute("title", `Activar tema ${nextThemeLabel}`);
    const label = toggle.querySelector("[data-theme-label]");
    if (label) label.textContent = "";
  });
};

const initTheme = () => {
  const initialTheme = getSavedTheme();
  applyTheme(initialTheme);

  document.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
    if (toggle.dataset.themeBound === "true") return;
    toggle.addEventListener("click", () => {
      const currentThemeIndex = THEMES.indexOf(getCurrentTheme());
      const nextTheme = THEMES[(currentThemeIndex + 1) % THEMES.length];
      applyTheme(nextTheme);
      saveTheme(nextTheme);
    });
    toggle.dataset.themeBound = "true";
  });
};

const syncThemeBeforeSwap = (event) => {
  if (event.newDocument) {
    applyThemeToDocument(event.newDocument);
  }
};

initTheme();

if (!window.__abThemeBound) {
  document.addEventListener("astro:before-swap", syncThemeBeforeSwap);
  document.addEventListener("astro:page-load", initTheme);
  document.addEventListener("astro:after-swap", initTheme);
  window.addEventListener("pageshow", initTheme);
  window.__abThemeBound = true;
}
