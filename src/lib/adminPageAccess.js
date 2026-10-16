const AUTHENTICATION_REQUIRED = 401;
const ACCESS_FORBIDDEN = 403;

const buildAccessLink = ({ label, href }) => {
  const link = document.createElement("a");
  link.className = "ab-secondary-button ab-admin-access-state__action";
  link.href = href;
  link.textContent = label;
  return link;
};

export const renderAdminAccessState = ({ root, response, payload = {} }) => {
  const status = Number(response?.status);
  if (!root || (status !== AUTHENTICATION_REQUIRED && status !== ACCESS_FORBIDDEN)) return false;

  const suspended = status === ACCESS_FORBIDDEN && /suspendid/i.test(String(payload?.error ?? ""));
  const container = document.createElement("div");
  container.className = "ab-admin-access-state";
  container.setAttribute("role", "alert");

  const eyebrow = document.createElement("p");
  eyebrow.className = "ab-admin-dashboard__eyebrow";
  eyebrow.textContent = "Acceso administrativo";

  const title = document.createElement("h2");
  title.textContent = status === AUTHENTICATION_REQUIRED
    ? "Necesitás iniciar sesión"
    : suspended
      ? "Cuenta restringida"
      : "Acceso restringido";

  const message = document.createElement("p");
  message.className = "ab-muted-text";
  message.textContent = status === AUTHENTICATION_REQUIRED
    ? "Iniciá sesión con una cuenta administradora para acceder a este panel."
    : suspended
      ? String(payload?.error ?? "Tu cuenta está suspendida. Contactá a administración.")
      : "No tenés permiso para acceder al panel administrativo.";

  const currentPath = `${window.location.pathname}${window.location.search}`;
  const action = status === AUTHENTICATION_REQUIRED
    ? buildAccessLink({
      label: "Iniciar sesión",
      href: `/login?returnTo=${encodeURIComponent(currentPath)}`,
    })
    : buildAccessLink({ label: "Volver al inicio", href: "/" });

  container.append(eyebrow, title, message, action);
  root.classList.add("is-access-restricted");
  root.replaceChildren(container);
  return true;
};
