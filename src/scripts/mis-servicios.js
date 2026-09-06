/* Mis servicios: renderiza servicios activos e historial del usuario. */
import { supabase } from "../lib/supabaseClient";

let activeContainer = document.getElementById("service-active");
let list = document.getElementById("service-list");
let emptyState = document.getElementById("services-empty");
let historyTitle = document.getElementById("service-history-title");
let resetButton = document.getElementById("services-reset");

/* Reconsulta referencias porque Astro puede reemplazar el DOM. */
const refreshServiceNodes = () => {
  activeContainer = document.getElementById("service-active");
  list = document.getElementById("service-list");
  emptyState = document.getElementById("services-empty");
  historyTitle = document.getElementById("service-history-title");
  resetButton = document.getElementById("services-reset");
};

/* Vincula acciones de la página sin duplicar listeners. */
const bindServiceEvents = () => {
  refreshServiceNodes();
  if (resetButton && resetButton.dataset.abServiceEventsBound !== "true") {
    resetButton.addEventListener("click", async () => {
      const payload = await resetServices();
      if (!payload) return;
      renderServices(payload);
    });
    resetButton.dataset.abServiceEventsBound = "true";
  }
};

/* Muestra un valor legible aunque el dato venga vacío. */
const formatServiceValue = (value, fallback = "Sin datos") => {
  const safe = String(value ?? "").trim();
  return safe || fallback;
};

/* Evita que los textos guardados en el servicio se interpreten como HTML. */
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

/* Un servicio real referencia al profesional por su UUID de Auth/Supabase. */
const getProviderProfileHref = (service) => {
  const providerUserId = String(service?.provider_user_id ?? service?.providerUserId ?? "").trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(providerUserId);
  if (!isUuid) return "";
  const from = `${window.location.pathname}${window.location.search}`;
  return `/proveedor-publico/${encodeURIComponent(providerUserId)}?from=${encodeURIComponent(from)}`;
};

/* Renderiza el servicio en curso. */
const renderActive = (active) => {
  if (!activeContainer) return;
  if (!active) {
    activeContainer.innerHTML = "";
    return;
  }

  const providerProfileHref = getProviderProfileHref(active);

  activeContainer.innerHTML = `
    <article class="ab-service-card ab-service-card--active">
      <div class="ab-service-card__header">
        <div>
          <p class="ab-service-card__meta">En progreso</p>
          <h2 class="ab-service-card__title">${escapeHtml(formatServiceValue(active.title, "Servicio en curso"))}</h2>
        </div>
        <span class="ab-service-card__status ab-service-card__status--active">En curso</span>
      </div>
      <div class="ab-service-card__details">
        <p>Profesional: ${escapeHtml(formatServiceValue(active.professional, "Pendiente"))}</p>
        <p>Inicio: ${escapeHtml(formatServiceValue(active.startDate, "Por confirmar"))}</p>
        <p>Dirección: ${escapeHtml(formatServiceValue(active.location, "Sin definir"))}</p>
      </div>
      ${providerProfileHref ? `
        <div class="ab-actions">
          <a class="ab-cta-button" href="${providerProfileHref}">Ver perfil del profesional</a>
        </div>
      ` : ""}
    </article>
  `;
};

/* Renderiza servicios finalizados. */
const renderHistory = (history) => {
  if (!list || !historyTitle) return;
  list.innerHTML = "";
  if (!Array.isArray(history) || history.length === 0) {
    historyTitle.style.display = "none";
    return;
  }
  historyTitle.style.display = "";

  history.forEach((service) => {
    const wrapper = document.createElement("article");
    wrapper.className = "ab-service-card";
    wrapper.innerHTML = `
      <div class="ab-service-card__header">
        <div>
          <p class="ab-service-card__meta">Finalizado</p>
          <h3 class="ab-service-card__title">${escapeHtml(formatServiceValue(service.title, "Servicio finalizado"))}</h3>
        </div>
        <span class="ab-service-card__status ab-service-card__status--done">Finalizado</span>
      </div>
      <div class="ab-service-card__details">
        <p>Profesional: ${escapeHtml(formatServiceValue(service.professional, "N/A"))}</p>
        <p>Fecha: ${escapeHtml(formatServiceValue(service.date, "Sin fecha"))}</p>
        <p>Calificación: ${escapeHtml(formatServiceValue(service.rating, "Sin datos"))}</p>
      </div>
    `;
    list.appendChild(wrapper);
  });
};

/* Coordina estado activo, historial y vacío. */
const renderServices = ({ active, history }) => {
  renderActive(active ?? null);
  renderHistory(Array.isArray(history) ? history : []);
  if (!emptyState) return;
  const hasActive = Boolean(active);
  const hasHistory = Array.isArray(history) && history.length > 0;
  emptyState.style.display = hasActive || hasHistory ? "none" : "grid";
};

/* Carga servicios del usuario autenticado. */
const fetchServices = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    window.location.href = "/login?returnTo=/mis-servicios";
    return null;
  }

  const response = await fetch("/api/my-services", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return payload;
};

/* Restaura los datos de muestra desde el backend. */
const resetServices = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    window.location.href = "/login?returnTo=/mis-servicios";
    return null;
  }

  const response = await fetch("/api/my-services", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reset: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return payload;
};

/* Inicialización de datos para la vista. */
const initServices = async () => {
  const payload = await fetchServices();
  if (!payload) return;
  renderServices(payload);
};

bindServiceEvents();

document.addEventListener("astro:page-load", () => {
  refreshServiceNodes();
  bindServiceEvents();
  initServices();
});
document.addEventListener("astro:after-swap", () => {
  refreshServiceNodes();
  bindServiceEvents();
  initServices();
});
window.addEventListener("pageshow", () => {
  refreshServiceNodes();
  bindServiceEvents();
  initServices();
});

initServices();
