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
};

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
}[String(event ?? "")] ?? String(event ?? "Evento administrativo"));

const accessActionLabel = (action) => ({
  grant_admin: "Otorgar rol admin",
  revoke_admin: "Quitar rol admin",
  suspend_user: "Suspender cuenta",
  restore_user: "Restaurar cuenta",
  password_reset: "Restablecer cuenta",
  update_profile: "Editar perfil",
}[String(action ?? "")] ?? String(action ?? ""));

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

const renderDetail = (user) => {
  if (!detailElement) return;
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
};

const renderAdmins = () => {
  if (adminCountElement) adminCountElement.textContent = String(state.admins.length);
  if (!adminListElement) return;
  if (!state.admins.length) {
    adminListElement.innerHTML = `<p class="ab-muted-text">No hay administradores visibles.</p>`;
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
};

const renderAudit = () => {
  if (auditCountElement) auditCountElement.textContent = String(state.recentAudit.length);
  if (!auditListElement) return;
  if (!state.auditReady) {
    auditListElement.innerHTML = `<p class="ab-muted-text">No se pudo consultar la auditoría administrativa.</p>`;
    return;
  }
  if (!state.recentAudit.length) {
    auditListElement.innerHTML = `<p class="ab-muted-text">No hay eventos administrativos recientes.</p>`;
    return;
  }
  auditListElement.innerHTML = state.recentAudit.map((row) => {
    const statusClass = row.status === "failed" ? "is-failed" : row.status === "completed" ? "is-completed" : "is-requested";
    const actor = row.actor_label || row.actor_user_id || "Administrador";
    const target = row.target_label || row.target_user_id;
    const detail = [row.action ? accessActionLabel(row.action) : "", target ? `sobre ${target}` : ""].filter(Boolean).join(" ");
    return `
      <article class="ab-admin-users__audit-item ${statusClass}">
        <div class="ab-admin-users__audit-item-head">
          <strong>${escapeHtml(auditEventLabel(row.event))}</strong>
          <time datetime="${escapeHtml(row.created_at)}">${escapeHtml(formatDate(row.created_at))}</time>
        </div>
        <p>${escapeHtml(actor)}${detail ? ` · ${escapeHtml(detail)}` : ""}</p>
        ${row.reason ? `<small>Motivo: ${escapeHtml(row.reason)}</small>` : ""}
      </article>
    `;
  }).join("");
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
  state.isEditing = false;
  renderUsers();
});
detailElement?.addEventListener("click", (event) => {
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

fetchUsers().catch(() => setStatus("No se pudieron cargar los usuarios."));
