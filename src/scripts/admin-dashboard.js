import { supabase } from "../lib/supabaseClient";

const statusElement = document.getElementById("admin-health-status");
const listElement = document.getElementById("admin-health-list");
const notesElement = document.getElementById("admin-health-notes");
const okElement = document.getElementById("admin-health-ok");
const warningElement = document.getElementById("admin-health-warning");
const errorElement = document.getElementById("admin-health-error");

const setStatus = (message) => {
  if (statusElement) statusElement.textContent = message;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const statusLabel = (status) => {
  if (status === "ok") return "OK";
  if (status === "warning") return "Revisar";
  return "Error";
};

const renderSummary = (summary = {}) => {
  if (okElement) okElement.textContent = String(summary.ok ?? 0);
  if (warningElement) warningElement.textContent = String(summary.warnings ?? 0);
  if (errorElement) errorElement.textContent = String(summary.errors ?? 0);
};

const renderChecks = (checks = []) => {
  if (!listElement) return;
  if (!checks.length) {
    listElement.innerHTML = `<div class="ab-cart-empty"><p>No hay chequeos para mostrar.</p></div>`;
    return;
  }

  listElement.innerHTML = checks
    .map((check) => `
      <article class="ab-admin-health-card ab-admin-health-card--${escapeHtml(check.status)}">
        <div class="ab-admin-health-card__top">
          <span>${escapeHtml(check.area)}</span>
          <strong>${escapeHtml(statusLabel(check.status))}</strong>
        </div>
        <h3>${escapeHtml(check.label)}</h3>
        <p>${escapeHtml(check.detail)}</p>
        ${check.action ? `<small>${escapeHtml(check.action)}</small>` : ""}
      </article>
    `)
    .join("");
};

const renderNotes = (notes = []) => {
  if (!notesElement) return;
  notesElement.innerHTML = notes.length
    ? notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")
    : "";
};

const loadHealth = async () => {
  setStatus("Cargando estado operativo...");
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    setStatus("Tenés que iniciar sesión para entrar al panel.");
    return;
  }

  const response = await fetch("/api/admin/health", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    setStatus(payload?.error ?? "No se pudo cargar el estado operativo.");
    renderSummary({ ok: 0, warnings: 0, errors: 1 });
    renderChecks([]);
    renderNotes([]);
    return;
  }

  renderSummary(payload.summary);
  renderChecks(Array.isArray(payload.checks) ? payload.checks : []);
  renderNotes(Array.isArray(payload.notes) ? payload.notes : []);
  setStatus(`Estado actualizado: ${new Date(payload.generated_at).toLocaleString("es-AR")}`);
};

loadHealth().catch(() => {
  setStatus("No se pudo cargar el estado operativo.");
});
