import { supabase } from "../lib/supabaseClient";

const searchInput = document.getElementById("admin-user-search");
const searchButton = document.getElementById("admin-user-search-button");
const clearButton = document.getElementById("admin-user-clear-button");
const statusElement = document.getElementById("admin-users-status");
const listElement = document.getElementById("admin-users-list");
const detailElement = document.getElementById("admin-user-detail");
const mpChartElement = document.getElementById("admin-users-mp-chart");
const mpConnectedElement = document.getElementById("admin-users-mp-connected");
const mpDisconnectedElement = document.getElementById("admin-users-mp-disconnected");
const mpTotalElement = document.getElementById("admin-users-mp-total");
const adminListElement = document.getElementById("admin-users-admin-list");
const adminCountElement = document.getElementById("admin-users-admin-count");
const auditListElement = document.getElementById("admin-users-audit-list");
const auditCountElement = document.getElementById("admin-users-audit-count");
const overviewRefreshButton = document.getElementById("admin-user-overview-refresh-button");

const state = {
  query: "",
  users: [],
  selectedId: "",
  total: 0,
  admins: [],
  recentAudit: [],
  controlsReady: false,
  auditReady: false,
  mercadoPagoSummary: {
    total: 0,
    connected: 0,
    disconnected: 0,
    filtered: false,
  },
  isEditing: false,
  isSaving: false,
  isResettingPassword: false,
  isUpdatingAccess: false,
  overviewByUserId: new Map(),
  overviewErrors: new Map(),
  overviewLoadingIds: new Set(),
  overviewTab: "summary",
};

const initialQuery = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
if (initialQuery) {
  state.query = initialQuery;
  if (searchInput) searchInput.value = initialQuery;
}

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

const formatDate = (value) => {
  if (!value) return "Sin dato";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin dato";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const fullName = (user) => {
  const profile = user?.profile ?? {};
  return [profile.first_name, profile.last_name].map((part) => String(part ?? "").trim()).filter(Boolean).join(" ");
};

const valueOrDash = (value) => {
  const clean = String(value ?? "").trim();
  return clean || "-";
};

const formatMoney = (value, currency = "ARS") => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: String(currency || "ARS"),
    maximumFractionDigits: 2,
  }).format(amount);
};

const statusLabel = (status) => ({
  active: "Activa",
  approved: "Aprobado",
  pending: "Pendiente",
  pending_payment: "Pago pendiente",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  expired: "Vencida",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial",
  refund_pending: "Reembolso pendiente",
  completed: "Completado",
  shipped: "Enviado",
  delivered: "Entregado",
  picked_up: "Retirado",
  preparing: "En preparación",
  not_requested: "Sin envío",
  ready_for_pickup: "Listo para retirar",
  requested: "Despacho pendiente",
  pickup_pending: "Retiro pendiente",
  visible: "Visible",
  sin_stock: "Sin stock",
  vencida: "Vencida",
  not_connected: "Sin conexión",
  unavailable: "No verificable ahora",
  verified: "Verificado ahora",
}[String(status ?? "").toLowerCase()] ?? valueOrDash(status));

const statusTone = (status) => {
  const normalized = String(status ?? "").toLowerCase();
  if (["active", "approved", "completed", "shipped", "delivered", "picked_up", "ready_for_pickup", "visible", "verified"].includes(normalized)) return "is-ok";
  if (["pending", "pending_payment", "refund_pending", "requested", "pickup_pending", "unavailable"].includes(normalized)) return "is-warning";
  if (["rejected", "cancelled", "canceled", "expired", "refunded", "sin_stock", "vencida", "not_connected"].includes(normalized)) return "is-danger";
  return "";
};

const renderStatus = (status, label = statusLabel(status)) => `
  <strong class="ab-card-status-highlight ab-admin-overview__status ${statusTone(status)}">${escapeHtml(label)}</strong>
`;

const editableProfileFields = [
  ["first_name", "Nombre", "text"],
  ["last_name", "Apellido", "text"],
  ["phone", "Telefono", "tel"],
  ["dni", "DNI", "text"],
  ["address", "Direccion", "text"],
  ["city", "Ciudad", "text"],
  ["province", "Provincia", "text"],
  ["postal_code", "Codigo postal", "text"],
];

const renderDetailRow = (label, value) => `
  <div class="ab-admin-users__detail-row">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(valueOrDash(value))}</strong>
  </div>
`;

const renderMercadoPagoDetailRow = (connected) => `
  <div class="ab-admin-users__detail-row">
    <span>Mercado Pago</span>
    <strong class="ab-admin-users__mp-status ab-card-status-highlight ${connected ? "ab-admin-users__mp-status--connected" : "ab-admin-users__mp-status--disconnected"}">
      ${connected ? "Mercado Pago conectado" : "Sin Mercado Pago"}
    </strong>
  </div>
`;

const adminSourceLabel = (source) => ({
  table: "Base de datos",
  env: "Vercel",
  both: "Base y Vercel",
}[String(source ?? "")] ?? "Sin rol");

const auditEventLabel = (event) => ({
  admin_access_action_requested: "Acción de acceso solicitada",
  admin_access_action_completed: "Acción de acceso completada",
  admin_access_action_failed: "Acción de acceso fallida",
  admin_password_reset_action_requested: "Restablecimiento solicitado",
  admin_password_reset_requested: "Restablecimiento enviado",
  admin_password_reset_action_failed: "Restablecimiento fallido",
  admin_profile_update_requested: "Edición de perfil solicitada",
  admin_profile_update: "Perfil actualizado",
  admin_profile_update_failed: "Edición de perfil fallida",
  admin_permission_denied: "Acceso administrativo rechazado",
}[String(event ?? "")] ?? String(event ?? "Evento administrativo"));

const accessActionLabel = (action) => ({
  grant_admin: "Otorgar rol admin",
  revoke_admin: "Quitar rol admin",
  suspend_user: "Suspender cuenta",
  restore_user: "Restaurar cuenta",
  password_reset: "Restablecer cuenta",
  update_profile: "Editar perfil",
  access_admin_panel: "Ingresar al panel",
}[String(action ?? "")] ?? String(action ?? ""));

const auditReasonLabel = (reason) => ({
  missing_admin_role: "El usuario no tiene rol administrador",
}[String(reason ?? "")] ?? String(reason ?? ""));

const renderEditField = ([field, label, type], profile = {}) => `
  <label class="ab-admin-users__edit-field">
    <span>${escapeHtml(label)}</span>
    <input
      name="${escapeHtml(field)}"
      type="${escapeHtml(type)}"
      value="${escapeHtml(profile?.[field] ?? "")}"
      ${field === "phone" ? 'inputmode="numeric" maxlength="15"' : ""}
      ${field === "dni" ? 'inputmode="numeric" maxlength="8"' : ""}
      ${field === "postal_code" ? 'maxlength="10"' : ""}
      ${["first_name", "last_name"].includes(field) ? 'maxlength="60"' : ""}
      ${["city", "province"].includes(field) ? 'maxlength="80"' : ""}
      ${field === "address" ? 'maxlength="120"' : ""}
      required
    />
  </label>
`;

const renderEditForm = (user) => `
  <form class="ab-admin-users__edit-form" id="admin-user-profile-form">
    <div class="ab-admin-users__edit-grid">
      ${editableProfileFields.map((field) => renderEditField(field, user.profile)).join("")}
    </div>
    <label class="ab-admin-users__edit-field ab-admin-users__edit-field--wide">
      <span>Motivo del cambio</span>
      <textarea name="reason" rows="2" maxlength="240" required placeholder="Ej: correccion solicitada por el usuario"></textarea>
    </label>
    <div class="ab-admin-users__edit-actions">
      <button type="submit" class="ab-cta-button" ${state.isSaving ? "disabled" : ""}>
        <span>${state.isSaving ? "Guardando..." : "Guardar cambios"}</span>
      </button>
      <button type="button" class="ab-secondary-button" data-admin-edit-cancel ${state.isSaving ? "disabled" : ""}>
        <span>Cancelar</span>
      </button>
    </div>
  </form>
`;

let passwordResetModal = null;
let passwordResetModalUser = null;
let passwordResetModalLast = null;
let passwordResetModalAccept = null;
let passwordResetModalReason = null;
let passwordResetResolver = null;
let summaryModal = null;
let summaryModalTitle = null;
let summaryModalDescription = null;
let summaryModalBody = null;
let summaryModalKind = "";

const getLastPasswordResetText = (user) => {
  const lastSentAt = String(user?.password_reset?.last_sent_at ?? "").trim();
  if (!lastSentAt) return "No hay envios anteriores registrados.";
  return `Ultimo envio registrado: ${formatDate(lastSentAt)}.`;
};

const closePasswordResetModal = (accepted) => {
  if (!passwordResetModal) return;
  const reason = String(passwordResetModalReason?.value ?? "").trim();
  if (accepted && reason.length < 6) {
    setStatus("Ingresá un motivo de al menos 6 caracteres para auditar el restablecimiento.");
    passwordResetModalReason?.focus();
    return;
  }
  passwordResetModal.classList.add("ab-is-hidden");
  passwordResetModal.setAttribute("aria-hidden", "true");
  const resolve = passwordResetResolver;
  passwordResetResolver = null;
  if (resolve) resolve({ accepted: Boolean(accepted), reason: accepted ? reason : "" });
};

const ensurePasswordResetModal = () => {
  if (passwordResetModal) return;

  passwordResetModal = document.createElement("div");
  passwordResetModal.className = "ab-orders-modal ab-is-hidden";
  passwordResetModal.setAttribute("role", "dialog");
  passwordResetModal.setAttribute("aria-modal", "true");
  passwordResetModal.setAttribute("aria-hidden", "true");
  passwordResetModal.setAttribute("aria-labelledby", "admin-password-reset-title");
  passwordResetModal.innerHTML = `
    <div class="ab-orders-modal__backdrop" data-admin-password-reset-close></div>
    <div class="ab-orders-modal__panel" role="document">
      <p class="ab-admin-reset-modal__last" id="admin-password-reset-last"></p>
      <h2 id="admin-password-reset-title">Restablecer cuenta</h2>
      <p id="admin-password-reset-user"></p>
      <label class="ab-admin-users__edit-field">
        <span>Motivo obligatorio</span>
        <textarea id="admin-password-reset-reason" rows="2" maxlength="240" placeholder="Ej: solicitud verificada del titular" required></textarea>
      </label>
      <div class="ab-orders-modal__actions">
        <button type="button" class="ab-orders-delete-btn ab-orders-delete-btn--ghost" data-admin-password-reset-cancel>
          Cancelar
        </button>
        <button type="button" class="ab-orders-delete-btn" data-admin-password-reset-accept>
          Enviar email
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(passwordResetModal);

  passwordResetModalUser = passwordResetModal.querySelector("#admin-password-reset-user");
  passwordResetModalLast = passwordResetModal.querySelector("#admin-password-reset-last");
  passwordResetModalAccept = passwordResetModal.querySelector("[data-admin-password-reset-accept]");
  passwordResetModalReason = passwordResetModal.querySelector("#admin-password-reset-reason");
  passwordResetModal.querySelector("[data-admin-password-reset-close]")?.addEventListener("click", () => closePasswordResetModal(false));
  passwordResetModal.querySelector("[data-admin-password-reset-cancel]")?.addEventListener("click", () => closePasswordResetModal(false));
  passwordResetModalAccept?.addEventListener("click", () => closePasswordResetModal(true));
};

const confirmPasswordReset = (user) => {
  ensurePasswordResetModal();
  if (!passwordResetModal) return Promise.resolve({ accepted: false, reason: "" });
  if (passwordResetModalReason) passwordResetModalReason.value = "";
  if (passwordResetModalLast) passwordResetModalLast.textContent = getLastPasswordResetText(user);
  if (passwordResetModalUser) {
    const email = String(user?.email ?? "").trim();
    passwordResetModalUser.textContent = `Se enviara un email para que ${email || "este usuario"} cree una contraseña nueva.`;
  }
  passwordResetModal.classList.remove("ab-is-hidden");
  passwordResetModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => passwordResetModalReason?.focus(), 0);
  return new Promise((resolve) => {
    passwordResetResolver = resolve;
  });
};

const closeSummaryModal = () => {
  if (!summaryModal) return;
  summaryModal.classList.add("ab-is-hidden");
  summaryModal.setAttribute("aria-hidden", "true");
  summaryModalKind = "";
};

const ensureSummaryModal = () => {
  if (summaryModal) return;
  summaryModal = document.createElement("div");
  summaryModal.className = "ab-orders-modal ab-admin-summary-modal ab-is-hidden";
  summaryModal.setAttribute("role", "dialog");
  summaryModal.setAttribute("aria-modal", "true");
  summaryModal.setAttribute("aria-hidden", "true");
  summaryModal.setAttribute("aria-labelledby", "admin-summary-modal-title");
  summaryModal.innerHTML = `
    <div class="ab-orders-modal__backdrop" data-admin-summary-close></div>
    <div class="ab-orders-modal__panel ab-admin-summary-modal__panel" role="document">
      <div class="ab-admin-summary-modal__head">
        <div>
          <h2 id="admin-summary-modal-title"></h2>
          <p id="admin-summary-modal-description"></p>
        </div>
        <button type="button" class="ab-secondary-button" data-admin-summary-close><span>Cerrar</span></button>
      </div>
      <div class="ab-admin-summary-modal__body" id="admin-summary-modal-body"></div>
    </div>
  `;
  document.body.appendChild(summaryModal);
  summaryModalTitle = summaryModal.querySelector("#admin-summary-modal-title");
  summaryModalDescription = summaryModal.querySelector("#admin-summary-modal-description");
  summaryModalBody = summaryModal.querySelector("#admin-summary-modal-body");
  summaryModal.querySelectorAll("[data-admin-summary-close]").forEach((button) => {
    button.addEventListener("click", closeSummaryModal);
  });
};

const getSummaryModalContent = (kind) => {
  if (kind === "mercadopago") {
    const summary = state.mercadoPagoSummary ?? {};
    const total = Number(summary.total) || 0;
    const connected = Number(summary.connected) || 0;
    const disconnected = Math.max(0, Number(summary.disconnected) || 0);
    return {
      title: "Mercado Pago",
      description: "Estado general de conexión de las cuentas vendedoras.",
      body: `
        <div class="ab-admin-summary-modal__stats">
          <article><strong>${connected}</strong><span>Conectados</span><small>Cuenta OAuth identificada</small></article>
          <article><strong>${disconnected}</strong><span>Sin Mercado Pago</span><small>Requieren conexión para vender</small></article>
          <article><strong>${total}</strong><span>Usuarios registrados</span><small>${summary.filtered ? "Resultado filtrado" : "Directorio completo"}</small></article>
        </div>
      `,
    };
  }
  if (kind === "access") {
    return {
      title: "Accesos administrativos",
      description: "Administradores activos y origen de cada permiso.",
      body: `<div class="ab-admin-users__admin-list">${adminListElement?.innerHTML || '<p class="ab-muted-text">Sin datos disponibles.</p>'}</div>`,
    };
  }
  return {
    title: "Trazabilidad administrativa",
    description: "Eventos recientes registrados para acciones del panel.",
    body: `<div class="ab-admin-users__audit-list">${auditListElement?.innerHTML || '<p class="ab-muted-text">Sin datos disponibles.</p>'}</div>`,
  };
};

const updateSummaryModal = (kind) => {
  const content = getSummaryModalContent(kind);
  if (summaryModalTitle) summaryModalTitle.textContent = content.title;
  if (summaryModalDescription) summaryModalDescription.textContent = content.description;
  if (summaryModalBody) summaryModalBody.innerHTML = content.body;
};

const openSummaryModal = (kind) => {
  ensureSummaryModal();
  if (!summaryModal) return;
  summaryModalKind = kind;
  updateSummaryModal(kind);
  summaryModal.classList.remove("ab-is-hidden");
  summaryModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => summaryModal.querySelector("[data-admin-summary-close]")?.focus(), 0);
};

const renderAccessControl = (user) => {
  const access = user?.access ?? {};
  const isAdmin = Boolean(access.is_admin);
  const isSuspended = Boolean(access.is_suspended);
  const isSelf = Boolean(access.is_current_admin);
  const envManaged = ["env", "both"].includes(String(access.admin_source ?? ""));
  const busy = state.isUpdatingAccess;
  const roleAction = isAdmin ? "revoke_admin" : "grant_admin";
  const accountAction = isSuspended ? "restore_user" : "suspend_user";
  const roleDisabled = busy || !state.controlsReady || (!isAdmin && isSuspended) || (isAdmin && (isSelf || envManaged));
  const accountDisabled = busy || !state.controlsReady || (!isSuspended && isAdmin) || (!isSuspended && isSelf);
  const notices = [];
  if (!state.controlsReady) notices.push("Falta aplicar la migración administrativa en Supabase.");
  if (isSelf) notices.push("Tu propia cuenta no puede perder permisos ni suspenderse desde este panel.");
  if (isAdmin && envManaged) notices.push("Este rol también está configurado en Vercel y no se puede quitar desde aquí.");
  if (isAdmin && !isSuspended) notices.push("Para suspender esta cuenta, primero hay que quitarle el rol administrativo.");
  if (!isAdmin && isSuspended) notices.push("Restaurá la cuenta antes de otorgarle permisos administrativos.");

  return `
    <section class="ab-admin-users__access" aria-labelledby="admin-user-access-title">
      <div class="ab-admin-users__access-head">
        <div>
          <p class="ab-admin-dashboard__eyebrow">Control de acceso</p>
          <h3 id="admin-user-access-title">Rol y estado de cuenta</h3>
        </div>
        <div class="ab-admin-users__access-statuses">
          <strong class="ab-card-status-highlight ab-admin-users__status-pill ${isAdmin ? "is-admin" : ""}">
            ${isAdmin ? `Administrador · ${escapeHtml(adminSourceLabel(access.admin_source))}` : "Usuario"}
          </strong>
          <strong class="ab-card-status-highlight ab-admin-users__status-pill ${isSuspended ? "is-suspended" : "is-active"}">
            ${isSuspended ? "Suspendido" : "Activo"}
          </strong>
        </div>
      </div>
      ${isSuspended && access.reason ? `<p class="ab-admin-users__suspension-reason"><strong>Motivo vigente:</strong> ${escapeHtml(access.reason)}</p>` : ""}
      <label class="ab-admin-users__edit-field ab-admin-users__access-reason">
        <span>Motivo obligatorio</span>
        <textarea id="admin-user-access-reason" rows="2" maxlength="240" placeholder="Ej: revisión solicitada por administración" ${busy ? "disabled" : ""}></textarea>
      </label>
      <div class="ab-admin-users__access-actions">
        <button type="button" class="ab-secondary-button" data-admin-access-action="${roleAction}" ${roleDisabled ? "disabled" : ""}>
          <span>${busy ? "Procesando..." : (isAdmin ? "Quitar rol admin" : "Hacer administrador")}</span>
        </button>
        <button type="button" class="ab-secondary-button ${isSuspended ? "" : "ab-admin-users__danger-button"}" data-admin-access-action="${accountAction}" ${accountDisabled ? "disabled" : ""}>
          <span>${busy ? "Procesando..." : (isSuspended ? "Restaurar cuenta" : "Suspender cuenta")}</span>
        </button>
      </div>
      ${notices.length ? `<div class="ab-admin-users__access-notes">${notices.map((notice) => `<small>${escapeHtml(notice)}</small>`).join("")}</div>` : ""}
    </section>
  `;
};

const renderOverviewEmpty = (message) => `<p class="ab-admin-overview__empty">${escapeHtml(message)}</p>`;

const renderOverviewSummary = (overview) => {
  const summary = overview?.summary ?? {};
  const mp = overview?.mercado_pago ?? {};
  const identityStatus = !mp.connected
    ? "not_connected"
    : mp.live_status !== "verified"
      ? mp.live_status
      : mp.identity_matches
        ? "approved"
        : "rejected";
  const identityLabel = !mp.connected
    ? "Sin Mercado Pago"
    : mp.identity_exception
      ? "Identidad exceptuada"
      : mp.live_status !== "verified"
        ? statusLabel(mp.live_status)
        : mp.identity_matches
          ? "Identidad coincidente"
          : "Identidad no coincidente";
  const warnings = [];
  if (mp.token_expired) warnings.push("El token OAuth figura vencido.");
  if (mp.connected && mp.live_status === "unavailable") warnings.push(mp.live_error || "No se pudo verificar Mercado Pago.");
  if (mp.connected && mp.live_status === "verified" && !mp.stored_matches_live) warnings.push("El MP user ID consultado no coincide con el guardado.");
  if (mp.connected && mp.live_status === "verified" && !mp.identity_matches && !mp.identity_exception) {
    warnings.push(`No coinciden: ${(mp.mismatches ?? []).join(", ") || "identidad"}.`);
  }

  return `
    <div class="ab-admin-overview__metrics">
      <article><strong>${Number(summary.publications) || 0}</strong><span>publicaciones</span><small>${Number(summary.visible_publications) || 0} visibles</small></article>
      <article><strong>${Number(summary.purchases) || 0}</strong><span>compras</span><small>${Number(summary.purchase_statuses?.pending) || 0} pendientes</small></article>
      <article><strong>${Number(summary.sales) || 0}</strong><span>ventas</span><small>${Number(summary.pending_fulfillment) || 0} entregas pendientes</small></article>
      <article class="${Number(summary.incidents) > 0 ? "has-alert" : ""}"><strong>${Number(summary.incidents) || 0}</strong><span>alertas</span><small>requieren revisión</small></article>
    </div>
    <section class="ab-admin-overview__mp">
      <div class="ab-admin-overview__section-head">
        <div><p class="ab-admin-dashboard__eyebrow">Diagnóstico en vivo</p><h4>Mercado Pago e identidad</h4></div>
        ${renderStatus(identityStatus, identityLabel)}
      </div>
      <div class="ab-admin-overview__facts">
        <span><small>MP user ID</small><strong>${escapeHtml(valueOrDash(mp.mp_user_id))}</strong></span>
        <span><small>Conectado</small><strong>${escapeHtml(formatDate(mp.connected_at))}</strong></span>
        <span><small>Token vence</small><strong>${escapeHtml(formatDate(mp.expires_at))}</strong></span>
        <span><small>Cuenta MP</small><strong>${escapeHtml([mp.account?.first_name, mp.account?.last_name].filter(Boolean).join(" ") || "-")}</strong></span>
      </div>
      ${mp.identity_exception ? `<p class="ab-admin-overview__notice is-info">Excepción autorizada para MP User ID 1157622469. La excepción queda visible; no se presenta como coincidencia ordinaria.</p>` : ""}
      ${warnings.map((warning) => `<p class="ab-admin-overview__notice">${escapeHtml(warning)}</p>`).join("")}
    </section>
  `;
};

const renderOverviewProducts = (overview) => {
  const products = overview?.products ?? [];
  if (!products.length) return renderOverviewEmpty("Este usuario no tiene publicaciones registradas.");
  return `<div class="ab-admin-overview__records">${products.map((product) => `
    <article class="ab-admin-overview__record">
      <div class="ab-admin-overview__record-main">
        <strong>${escapeHtml(product.title || "Producto")}</strong>
        <small>${escapeHtml(product.publication_type === "monthly" ? "Mensual" : "Permanente")} · stock ${Number(product.stock) || 0} · ${escapeHtml(formatMoney(product.price, product.currency))}</small>
      </div>
      <div class="ab-admin-overview__record-statuses">
        ${renderStatus(product.publication_status)}
        ${renderStatus(product.reason, product.visible ? "Visible" : statusLabel(product.reason))}
      </div>
      <small>${product.publication_type === "monthly" ? `Vence: ${escapeHtml(formatDate(product.publication_expires_at))}` : `Publicada: ${escapeHtml(formatDate(product.publication_started_at || product.created_at))}`}</small>
    </article>
  `).join("")}</div>`;
};

const renderOverviewOrders = (rows, type) => {
  if (!rows.length) return renderOverviewEmpty(type === "purchase" ? "Este usuario no tiene compras registradas." : "Este usuario no tiene ventas registradas.");
  return `<div class="ab-admin-overview__records">${rows.map((row) => {
    const status = row.payment_status || row.status;
    const fulfillment = type === "sale" ? row.fulfillment_status : row.shipping_status;
    const reference = type === "sale" ? row.order_id : row.id;
    return `
      <article class="ab-admin-overview__record">
        <div class="ab-admin-overview__record-main">
          <strong>${escapeHtml(row.display_name || "Orden")}</strong>
          <small>${escapeHtml(formatMoney(row.amount, row.currency))} · ${escapeHtml(formatDate(row.created_at))}</small>
        </div>
        <div class="ab-admin-overview__record-statuses">
          ${renderStatus(status)}
          ${fulfillment ? renderStatus(fulfillment) : ""}
        </div>
        <small>Orden ${escapeHtml(reference || "-")}${row.payment_id ? ` · Pago ${escapeHtml(row.payment_id)}` : ""}</small>
      </article>
    `;
  }).join("")}</div>`;
};

const renderOverviewTimeline = (overview) => {
  const timeline = overview?.timeline ?? [];
  if (!timeline.length) return renderOverviewEmpty("No hay actividad cronológica disponible.");
  return `<div class="ab-admin-overview__timeline">${timeline.map((event) => `
    <article>
      <span class="ab-admin-overview__timeline-dot ${statusTone(event.status)}"></span>
      <div>
        <strong>${escapeHtml(event.title)}</strong>
        <small>${escapeHtml(event.detail || "")} · ${escapeHtml(formatDate(event.at))}</small>
      </div>
    </article>
  `).join("")}</div>`;
};

const overviewTabs = [
  ["summary", "Resumen"],
  ["products", "Publicaciones"],
  ["purchases", "Compras"],
  ["sales", "Ventas"],
  ["timeline", "Actividad"],
];

const overviewSectionMeta = {
  summary: ["Estado general", "Indicadores comerciales y validación de Mercado Pago."],
  products: ["Publicaciones del usuario", "Estado, modalidad, stock y visibilidad de cada producto."],
  purchases: ["Compras realizadas", "Pagos, importes y estado de entrega de sus órdenes."],
  sales: ["Ventas realizadas", "Cobros y cumplimiento pendiente como vendedor."],
  timeline: ["Actividad reciente", "Cronología conjunta de operaciones y acciones administrativas."],
};

const renderUserOverview = (user) => {
  const overview = state.overviewByUserId.get(user.id);
  const error = state.overviewErrors.get(user.id);
  const loading = state.overviewLoadingIds.has(user.id);
  if (loading && !overview) return `<section class="ab-admin-overview"><p class="ab-muted-text">Cargando datos del usuario...</p></section>`;
  if (error && !overview) return `
    <section class="ab-admin-overview">
      ${renderOverviewEmpty(error)}
      <button type="button" class="ab-secondary-button" data-admin-overview-refresh><span>Reintentar</span></button>
    </section>`;
  if (!overview) return `<section class="ab-admin-overview"><p class="ab-muted-text">Preparando datos del usuario...</p></section>`;

  const content = {
    summary: renderOverviewSummary(overview),
    products: renderOverviewProducts(overview),
    purchases: renderOverviewOrders(overview.purchases ?? [], "purchase"),
    sales: renderOverviewOrders(overview.sales ?? [], "sale"),
    timeline: renderOverviewTimeline(overview),
  }[state.overviewTab] ?? renderOverviewSummary(overview);
  const [sectionTitle, sectionDescription] = overviewSectionMeta[state.overviewTab] ?? overviewSectionMeta.summary;

  return `
    <section class="ab-admin-overview" aria-label="Actividad comercial del usuario">
      <div class="ab-admin-overview__head">
        <div><small>Actualizada ${escapeHtml(formatDate(overview.generated_at))} · hasta 200 registros recientes por sección</small></div>
      </div>
      <div class="ab-admin-overview__tabs" role="tablist" aria-label="Secciones de actividad del usuario">
        ${overviewTabs.map(([tab, label]) => `<button type="button" role="tab" aria-selected="${state.overviewTab === tab}" class="${state.overviewTab === tab ? "is-active" : ""}" data-admin-overview-tab="${tab}">${label}</button>`).join("")}
      </div>
      <div class="ab-admin-overview__content">
        <div class="ab-admin-overview__section-intro">
          <h3>${escapeHtml(sectionTitle)}</h3>
          <p>${escapeHtml(sectionDescription)}</p>
        </div>
        ${error ? `<p class="ab-admin-overview__notice">${escapeHtml(error)} Se conservan los últimos datos cargados.</p>` : ""}
        ${content}
      </div>
    </section>
  `;
};

const renderDetail = (user) => {
  if (!detailElement) return;
  if (overviewRefreshButton) {
    const loading = Boolean(user?.id && state.overviewLoadingIds.has(user.id));
    overviewRefreshButton.disabled = !user?.id || loading;
    const label = overviewRefreshButton.querySelector("span");
    if (label) label.textContent = loading ? "Actualizando..." : "Actualizar datos";
  }
  if (!user) {
    detailElement.innerHTML = `<p class="ab-muted-text">Seleccioná un usuario para ver sus datos.</p>`;
    return;
  }

  const name = fullName(user) || "Usuario sin nombre";
  const mpConnected = Boolean(user.mercado_pago?.connected);
  detailElement.innerHTML = `
    <div class="ab-admin-users__detail-head">
      <h2>${escapeHtml(name)}</h2>
      <p>${escapeHtml(user.email || "Sin email")}</p>
      <div class="ab-admin-users__detail-actions">
        <button type="button" class="ab-secondary-button" data-admin-edit-profile ${state.isResettingPassword || state.isUpdatingAccess ? "disabled" : ""}>
          <span>${state.isEditing ? "Editando datos" : "Editar datos"}</span>
        </button>
        <button type="button" class="ab-secondary-button" data-admin-password-reset ${state.isResettingPassword || state.isUpdatingAccess ? "disabled" : ""}>
          <span>${state.isResettingPassword ? "Enviando..." : "Restablecer cuenta"}</span>
        </button>
      </div>
    </div>
    ${state.isEditing ? renderEditForm(user) : ""}
    ${renderAccessControl(user)}
    <details class="ab-admin-users__identity">
      <summary>Identidad y datos registrados</summary>
      ${renderDetailRow("ID", user.id)}
      ${renderDetailRow("Teléfono", user.profile?.phone)}
      ${renderDetailRow("DNI", user.profile?.dni)}
      ${renderDetailRow("Dirección", user.profile?.address)}
      ${renderDetailRow("Ciudad", user.profile?.city)}
      ${renderDetailRow("Provincia", user.profile?.province)}
      ${renderDetailRow("Código postal", user.profile?.postal_code)}
      ${renderDetailRow("Alta", formatDate(user.created_at))}
      ${renderDetailRow("Último ingreso", formatDate(user.last_sign_in_at))}
      ${renderDetailRow("Email confirmado", formatDate(user.email_confirmed_at))}
      ${renderMercadoPagoDetailRow(mpConnected)}
      ${renderDetailRow("MP user id", user.mercado_pago?.mp_user_id)}
    </details>
    ${renderUserOverview(user)}
  `;
};

const renderUsers = () => {
  if (!listElement) return;
  if (!state.users.length) {
    listElement.innerHTML = `<div class="ab-cart-empty"><p>No se encontraron usuarios.</p></div>`;
    renderDetail(null);
    return;
  }

  const selectedUser = state.users.find((user) => user.id === state.selectedId) ?? state.users[0];
  state.selectedId = selectedUser?.id ?? "";

  listElement.innerHTML = state.users
    .map((user) => {
      const name = fullName(user) || "Usuario sin nombre";
      const selected = user.id === state.selectedId;
      const mpConnected = Boolean(user.mercado_pago?.connected);
      const isSuspended = Boolean(user.access?.is_suspended);
      const isAdmin = Boolean(user.access?.is_admin);
      const cardStatus = isSuspended ? "Suspendido" : isAdmin ? "Admin" : mpConnected ? "Conectado" : "Sin MP";
      const statusClass = isSuspended
        ? "ab-admin-user-card__meta--suspended"
        : isAdmin
          ? "ab-admin-user-card__meta--admin"
          : mpConnected
            ? "ab-admin-user-card__meta--connected"
            : "ab-admin-user-card__meta--disconnected";
      return `
        <button type="button" class="ab-admin-user-card${selected ? " is-selected" : ""}" data-user-id="${escapeHtml(user.id)}">
          <span>
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(user.email || "Sin email")}</small>
          </span>
          <span class="ab-admin-user-card__meta ab-card-status-highlight ${statusClass}">
            ${cardStatus}
          </span>
        </button>
      `;
    })
    .join("");

  renderDetail(selectedUser);
  if (selectedUser?.id) {
    loadUserOverview(selectedUser.id).catch(() => {
      state.overviewLoadingIds.delete(selectedUser.id);
      state.overviewErrors.set(selectedUser.id, "No se pudieron cargar los datos del usuario.");
      renderDetail(getSelectedUser());
    });
  }
};

const renderMercadoPagoSummary = () => {
  const summary = state.mercadoPagoSummary ?? {};
  const total = Number(summary.total) || 0;
  const connected = Number(summary.connected) || 0;
  const disconnected = Math.max(0, Number(summary.disconnected) || 0);
  const connectedAngle = total > 0 ? Math.round((connected / total) * 360) : 0;

  if (mpChartElement) {
    mpChartElement.style.setProperty("--mp-connected-angle", `${connectedAngle}deg`);
    mpChartElement.setAttribute(
      "title",
      `${connected} conectados y ${disconnected} sin Mercado Pago`,
    );
  }
  if (mpConnectedElement) mpConnectedElement.textContent = String(connected);
  if (mpDisconnectedElement) mpDisconnectedElement.textContent = String(disconnected);
  if (mpTotalElement) {
    const totalLabel = total === 1 ? "1 usuario" : `${total} usuarios`;
    mpTotalElement.textContent = summary.filtered
      ? `${totalLabel} en la busqueda`
      : `${totalLabel} registrados`;
  }
  if (summaryModalKind === "mercadopago") updateSummaryModal(summaryModalKind);
};

const renderAdmins = () => {
  if (adminCountElement) adminCountElement.textContent = String(state.admins.length);
  if (!adminListElement) return;
  if (!state.admins.length) {
    adminListElement.innerHTML = `<p class="ab-muted-text">No hay administradores visibles.</p>`;
    if (summaryModalKind === "access") updateSummaryModal(summaryModalKind);
    return;
  }
  adminListElement.innerHTML = state.admins.map((admin) => `
    <article class="ab-admin-users__admin-item">
      <div>
        <strong>${escapeHtml(admin.label || "Usuario sin nombre")}</strong>
        <small>${escapeHtml(admin.email || admin.id)}</small>
      </div>
      <span class="ab-card-status-highlight">${escapeHtml(adminSourceLabel(admin.source))}</span>
    </article>
  `).join("");
  if (summaryModalKind === "access") updateSummaryModal(summaryModalKind);
};

const renderAudit = () => {
  if (auditCountElement) auditCountElement.textContent = String(state.recentAudit.length);
  if (!auditListElement) return;
  if (!state.auditReady) {
    auditListElement.innerHTML = `<p class="ab-muted-text">No se pudo consultar la auditoría administrativa.</p>`;
    if (summaryModalKind === "audit") updateSummaryModal(summaryModalKind);
    return;
  }
  if (!state.recentAudit.length) {
    auditListElement.innerHTML = `<p class="ab-muted-text">No hay eventos administrativos recientes.</p>`;
    if (summaryModalKind === "audit") updateSummaryModal(summaryModalKind);
    return;
  }
  auditListElement.innerHTML = state.recentAudit.map((row) => {
    const statusClass = ["failed", "rejected"].includes(row.status) ? "is-failed" : row.status === "completed" ? "is-completed" : "is-requested";
    const actor = row.actor_label || row.actor_user_id || "Administrador";
    const target = row.target_label || row.target_user_id;
    const detail = [row.action ? accessActionLabel(row.action) : "", target ? `sobre ${target}` : "", row.path || ""].filter(Boolean).join(" · ");
    return `
      <article class="ab-admin-users__audit-item ${statusClass}">
        <div class="ab-admin-users__audit-item-head">
          <strong>${escapeHtml(auditEventLabel(row.event))}</strong>
          <time datetime="${escapeHtml(row.created_at)}">${escapeHtml(formatDate(row.created_at))}</time>
        </div>
        <p>${escapeHtml(actor)}${detail ? ` · ${escapeHtml(detail)}` : ""}</p>
        ${row.reason ? `<small>Motivo: ${escapeHtml(auditReasonLabel(row.reason))}</small>` : ""}
      </article>
    `;
  }).join("");
  if (summaryModalKind === "audit") updateSummaryModal(summaryModalKind);
};

const fetchUsers = async () => {
  setStatus("Cargando usuarios...");
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    setStatus("Tenés que iniciar sesión para entrar al panel.");
    if (listElement) listElement.innerHTML = "";
    return;
  }

  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);

  const response = await fetch(`/api/admin/users?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    setStatus(payload?.error ?? "No se pudieron cargar los usuarios.");
    state.users = [];
    state.total = 0;
    state.admins = [];
    state.recentAudit = [];
    state.controlsReady = false;
    state.auditReady = false;
    state.mercadoPagoSummary = {
      total: 0,
      connected: 0,
      disconnected: 0,
      filtered: Boolean(state.query),
    };
    renderUsers();
    renderMercadoPagoSummary();
    renderAdmins();
    renderAudit();
    return;
  }

  state.users = Array.isArray(payload?.users) ? payload.users : [];
  state.total = Number(payload?.total) || state.users.length;
  state.admins = Array.isArray(payload?.admins) ? payload.admins : [];
  state.recentAudit = Array.isArray(payload?.recent_audit) ? payload.recent_audit : [];
  state.controlsReady = payload?.controls_ready === true;
  state.auditReady = payload?.audit_ready === true;
  state.mercadoPagoSummary = payload?.mercado_pago_summary ?? {
    total: state.total,
    connected: state.users.filter((user) => user.mercado_pago?.connected).length,
    disconnected: state.users.filter((user) => !user.mercado_pago?.connected).length,
    filtered: Boolean(state.query),
  };
  if (!state.users.some((user) => user.id === state.selectedId)) {
    state.selectedId = state.users[0]?.id ?? "";
  }
  const loadedCount = state.users.length;
  const totalText = state.total === 1 ? "1 usuario" : `${state.total} usuarios`;
  setStatus(
    state.query
      ? `Resultados para "${state.query}": ${totalText}.`
      : `Usuarios cargados: ${totalText}. Visibles ${loadedCount}.`,
  );
  renderUsers();
  renderMercadoPagoSummary();
  renderAdmins();
  renderAudit();
};

const getSelectedUser = () => state.users.find((user) => user.id === state.selectedId) ?? null;

const getAccessToken = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData?.session?.access_token ?? "";
};

const loadUserOverview = async (userId, { force = false } = {}) => {
  const safeUserId = String(userId ?? "").trim();
  if (!safeUserId || state.overviewLoadingIds.has(safeUserId)) return;
  if (!force && state.overviewByUserId.has(safeUserId)) return;

  const token = await getAccessToken();
  if (!token) {
    state.overviewErrors.set(safeUserId, "Tenés que iniciar sesión para cargar los datos del usuario.");
    renderDetail(getSelectedUser());
    return;
  }

  state.overviewLoadingIds.add(safeUserId);
  state.overviewErrors.delete(safeUserId);
  renderDetail(getSelectedUser());
  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(safeUserId)}/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      state.overviewErrors.set(safeUserId, payload?.error ?? "No se pudieron cargar los datos del usuario.");
      return;
    }
    state.overviewByUserId.set(safeUserId, payload);
  } finally {
    state.overviewLoadingIds.delete(safeUserId);
    if (state.selectedId === safeUserId) renderDetail(getSelectedUser());
  }
};

const refreshSelectedOverview = () => {
  const selectedUser = getSelectedUser();
  if (!selectedUser) return;
  loadUserOverview(selectedUser.id, { force: true }).catch(() => {
    state.overviewLoadingIds.delete(selectedUser.id);
    state.overviewErrors.set(selectedUser.id, "No se pudieron actualizar los datos del usuario.");
    renderDetail(getSelectedUser());
  });
};

const readProfileForm = (form) => {
  const formData = new FormData(form);
  const profile = {};
  for (const [field] of editableProfileFields) {
    profile[field] = String(formData.get(field) ?? "").trim();
  }
  return {
    profile,
    reason: String(formData.get("reason") ?? "").trim(),
  };
};

const updateSelectedUserProfile = (profile) => {
  state.users = state.users.map((user) => (
    user.id === state.selectedId
      ? { ...user, profile: { ...(user.profile ?? {}), ...(profile ?? {}) } }
      : user
  ));
};

const updateSelectedUserPasswordReset = (lastSentAt) => {
  state.users = state.users.map((user) => (
    user.id === state.selectedId
      ? { ...user, password_reset: { ...(user.password_reset ?? {}), last_sent_at: lastSentAt } }
      : user
  ));
};

const saveSelectedProfile = async (form) => {
  const selectedUser = getSelectedUser();
  if (!selectedUser || state.isSaving) return;

  const token = await getAccessToken();
  if (!token) {
    setStatus("Tenes que iniciar sesion para guardar cambios.");
    return;
  }

  const payload = readProfileForm(form);
  if (payload.reason.length < 6) {
    setStatus("Ingresa un motivo para auditar el cambio.");
    return;
  }

  state.isSaving = true;
  renderDetail(selectedUser);
  setStatus("Guardando cambios del usuario...");

  try {
    const response = await fetch("/api/admin/users/profile", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: selectedUser.id,
        profile: payload.profile,
        reason: payload.reason,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(result?.error ?? "No se pudo guardar el perfil.");
      return;
    }

    updateSelectedUserProfile(result?.profile ?? payload.profile);
    state.overviewByUserId.delete(selectedUser.id);
    state.isEditing = false;
    setStatus(result?.changed === false ? "No habia cambios para guardar." : "Perfil actualizado.");
    renderUsers();
  } finally {
    state.isSaving = false;
    renderDetail(getSelectedUser());
  }
};

const sendPasswordReset = async () => {
  const selectedUser = getSelectedUser();
  if (!selectedUser || state.isResettingPassword) return;
  const confirmation = await confirmPasswordReset(selectedUser);
  if (!confirmation.accepted) return;

  const token = await getAccessToken();
  if (!token) {
    setStatus("Tenes que iniciar sesion para enviar la solicitud.");
    return;
  }

  state.isResettingPassword = true;
  renderDetail(selectedUser);
  setStatus("Enviando solicitud de restablecimiento...");

  try {
    const response = await fetch("/api/admin/users/password-reset", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: selectedUser.id, reason: confirmation.reason }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(result?.error ?? "No se pudo enviar la solicitud.");
      return;
    }
    updateSelectedUserPasswordReset(result?.sent_at ?? new Date().toISOString());
    setStatus("Solicitud enviada. El usuario recibira el email de restablecimiento.");
  } finally {
    state.isResettingPassword = false;
    renderDetail(getSelectedUser());
  }
};

const runAccessAction = async (action) => {
  const selectedUser = getSelectedUser();
  if (!selectedUser || state.isUpdatingAccess) return;
  const reason = String(document.getElementById("admin-user-access-reason")?.value ?? "").trim();
  if (reason.length < 6) {
    setStatus("Ingresá un motivo de al menos 6 caracteres para auditar la acción.");
    document.getElementById("admin-user-access-reason")?.focus();
    return;
  }

  const token = await getAccessToken();
  if (!token) {
    setStatus("Tenés que iniciar sesión para administrar accesos.");
    return;
  }

  state.isUpdatingAccess = true;
  renderDetail(selectedUser);
  setStatus(`${accessActionLabel(action)}: procesando...`);

  try {
    const response = await fetch("/api/admin/users/access", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        user_id: selectedUser.id,
        reason,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(result?.error ?? "No se pudo completar la acción administrativa.");
      return;
    }

    state.isEditing = false;
    await fetchUsers();
    setStatus(`${accessActionLabel(action)}: acción completada y auditada.`);
  } finally {
    state.isUpdatingAccess = false;
    renderDetail(getSelectedUser());
  }
};

const runSearch = () => {
  state.query = String(searchInput?.value ?? "").trim();
  state.selectedId = "";
  fetchUsers().catch(() => setStatus("No se pudieron cargar los usuarios."));
};

searchButton?.addEventListener("click", runSearch);
searchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") runSearch();
});
clearButton?.addEventListener("click", () => {
  if (searchInput) searchInput.value = "";
  state.query = "";
  state.selectedId = "";
  fetchUsers().catch(() => setStatus("No se pudieron cargar los usuarios."));
});
listElement?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-user-id]");
  if (!button) return;
  state.selectedId = button.getAttribute("data-user-id") ?? "";
  state.overviewTab = "summary";
  state.isEditing = false;
  renderUsers();
});
detailElement?.addEventListener("click", (event) => {
  const overviewTab = event.target.closest("[data-admin-overview-tab]");
  if (overviewTab) {
    state.overviewTab = overviewTab.getAttribute("data-admin-overview-tab") ?? "summary";
    renderDetail(getSelectedUser());
    return;
  }

  const overviewRefresh = event.target.closest("[data-admin-overview-refresh]");
  if (overviewRefresh) {
    refreshSelectedOverview();
    return;
  }

  const accessButton = event.target.closest("[data-admin-access-action]");
  if (accessButton && !state.isUpdatingAccess) {
    const action = accessButton.getAttribute("data-admin-access-action") ?? "";
    runAccessAction(action).catch(() => {
      state.isUpdatingAccess = false;
      setStatus("No se pudo completar la acción administrativa.");
      renderDetail(getSelectedUser());
    });
    return;
  }

  const editButton = event.target.closest("[data-admin-edit-profile]");
  if (editButton && !state.isSaving) {
    state.isEditing = !state.isEditing;
    renderDetail(getSelectedUser());
    return;
  }

  const cancelButton = event.target.closest("[data-admin-edit-cancel]");
  if (cancelButton && !state.isSaving) {
    state.isEditing = false;
    renderDetail(getSelectedUser());
    return;
  }

  const passwordResetButton = event.target.closest("[data-admin-password-reset]");
  if (passwordResetButton && !state.isResettingPassword) {
    sendPasswordReset().catch(() => {
      state.isResettingPassword = false;
      setStatus("No se pudo enviar la solicitud.");
      renderDetail(getSelectedUser());
    });
  }
});
detailElement?.addEventListener("submit", (event) => {
  const form = event.target.closest("#admin-user-profile-form");
  if (!form) return;
  event.preventDefault();
  saveSelectedProfile(form).catch(() => {
    state.isSaving = false;
    setStatus("No se pudo guardar el perfil.");
    renderDetail(getSelectedUser());
  });
});

document.querySelectorAll("[data-admin-summary-modal]").forEach((button) => {
  button.addEventListener("click", () => {
    openSummaryModal(button.getAttribute("data-admin-summary-modal") ?? "audit");
  });
});

overviewRefreshButton?.addEventListener("click", refreshSelectedOverview);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && summaryModal && !summaryModal.classList.contains("ab-is-hidden")) {
    closeSummaryModal();
  }
});

fetchUsers().catch(() => setStatus("No se pudieron cargar los usuarios."));
