import { supabase } from "../lib/supabaseClient";

const activeContainer = document.getElementById("service-active");
const list = document.getElementById("service-list");
const emptyState = document.getElementById("services-empty");
const historyTitle = document.getElementById("service-history-title");
const resetButton = document.getElementById("services-reset");

const formatServiceValue = (value, fallback = "Sin datos") => {
  const safe = String(value ?? "").trim();
  return safe || fallback;
};

const renderActive = (active) => {
  if (!activeContainer) return;
  if (!active) {
    activeContainer.innerHTML = "";
    return;
  }

  activeContainer.innerHTML = `
    <article class="ab-service-card ab-service-card--active">
      <div class="ab-service-card__header">
        <div>
          <p class="ab-service-card__meta">En progreso</p>
          <h2 class="ab-service-card__title">${formatServiceValue(active.title, "Servicio en curso")}</h2>
        </div>
        <span class="ab-service-card__status ab-service-card__status--active">En curso</span>
      </div>
      <div class="ab-service-card__details">
        <p>Profesional: ${formatServiceValue(active.professional, "Pendiente")}</p>
        <p>Inicio: ${formatServiceValue(active.startDate, "Por confirmar")}</p>
        <p>Dirección: ${formatServiceValue(active.location, "Sin definir")}</p>
      </div>
      <div class="ab-actions">
        <a class="ab-cta-button" href="https://wa.me/5491137915210" target="_blank" rel="noreferrer">
          Contactar
        </a>
      </div>
    </article>
  `;
};

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
          <h3 class="ab-service-card__title">${formatServiceValue(service.title, "Servicio finalizado")}</h3>
        </div>
        <span class="ab-service-card__status ab-service-card__status--done">Finalizado</span>
      </div>
      <div class="ab-service-card__details">
        <p>Profesional: ${formatServiceValue(service.professional, "N/A")}</p>
        <p>Fecha: ${formatServiceValue(service.date, "Sin fecha")}</p>
        <p>Calificación: ${formatServiceValue(service.rating, "Sin datos")}</p>
      </div>
    `;
    list.appendChild(wrapper);
  });
};

const renderServices = ({ active, history }) => {
  renderActive(active ?? null);
  renderHistory(Array.isArray(history) ? history : []);
  if (!emptyState) return;
  const hasActive = Boolean(active);
  const hasHistory = Array.isArray(history) && history.length > 0;
  emptyState.style.display = hasActive || hasHistory ? "none" : "grid";
};

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

const initServices = async () => {
  const payload = await fetchServices();
  if (!payload) return;
  renderServices(payload);
};

resetButton?.addEventListener("click", async () => {
  const payload = await resetServices();
  if (!payload) return;
  renderServices(payload);
});

initServices();
