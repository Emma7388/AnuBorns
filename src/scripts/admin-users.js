import { supabase } from "../lib/supabaseClient";

const searchInput = document.getElementById("admin-user-search");
const searchButton = document.getElementById("admin-user-search-button");
const clearButton = document.getElementById("admin-user-clear-button");
const statusElement = document.getElementById("admin-users-status");
const listElement = document.getElementById("admin-users-list");
const detailElement = document.getElementById("admin-user-detail");
const prevButton = document.getElementById("admin-users-prev");
const nextButton = document.getElementById("admin-users-next");
const pageElement = document.getElementById("admin-users-page");

const state = {
  page: 1,
  perPage: 30,
  query: "",
  users: [],
  selectedId: "",
  hasMore: false,
  total: 0,
  totalPages: 0,
  isEditing: false,
  isSaving: false,
  isResettingPassword: false,
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
    <strong class="ab-admin-users__mp-status ${connected ? "ab-admin-users__mp-status--connected" : "ab-admin-users__mp-status--disconnected"}">
      ${connected ? "MP CONECTADO" : "SIN MP"}
    </strong>
  </div>
`;

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
let passwordResetResolver = null;

const getLastPasswordResetText = (user) => {
  const lastSentAt = String(user?.password_reset?.last_sent_at ?? "").trim();
  if (!lastSentAt) return "No hay envios anteriores registrados.";
  return `Ultimo envio registrado: ${formatDate(lastSentAt)}.`;
};

const closePasswordResetModal = (accepted) => {
  if (!passwordResetModal) return;
  passwordResetModal.classList.add("ab-is-hidden");
  passwordResetModal.setAttribute("aria-hidden", "true");
  const resolve = passwordResetResolver;
  passwordResetResolver = null;
  if (resolve) resolve(Boolean(accepted));
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
  passwordResetModal.querySelector("[data-admin-password-reset-close]")?.addEventListener("click", () => closePasswordResetModal(false));
  passwordResetModal.querySelector("[data-admin-password-reset-cancel]")?.addEventListener("click", () => closePasswordResetModal(false));
  passwordResetModalAccept?.addEventListener("click", () => closePasswordResetModal(true));
};

const confirmPasswordReset = (user) => {
  ensurePasswordResetModal();
  if (!passwordResetModal) return Promise.resolve(false);
  if (passwordResetModalLast) passwordResetModalLast.textContent = getLastPasswordResetText(user);
  if (passwordResetModalUser) {
    const email = String(user?.email ?? "").trim();
    passwordResetModalUser.textContent = `Se enviara un email para que ${email || "este usuario"} cree una contraseña nueva.`;
  }
  passwordResetModal.classList.remove("ab-is-hidden");
  passwordResetModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => passwordResetModalAccept?.focus(), 0);
  return new Promise((resolve) => {
    passwordResetResolver = resolve;
  });
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
        <button type="button" class="ab-secondary-button" data-admin-edit-profile ${state.isResettingPassword ? "disabled" : ""}>
          <span>${state.isEditing ? "Editando datos" : "Editar datos"}</span>
        </button>
        <button type="button" class="ab-secondary-button" data-admin-password-reset ${state.isResettingPassword ? "disabled" : ""}>
          <span>${state.isResettingPassword ? "Enviando..." : "Restablecer cuenta"}</span>
        </button>
      </div>
    </div>
    ${state.isEditing ? renderEditForm(user) : ""}
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
      return `
        <button type="button" class="ab-admin-user-card${selected ? " is-selected" : ""}" data-user-id="${escapeHtml(user.id)}">
          <span>
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(user.email || "Sin email")}</small>
          </span>
          <span class="ab-admin-user-card__meta ${mpConnected ? "ab-admin-user-card__meta--connected" : "ab-admin-user-card__meta--disconnected"}">
            ${mpConnected ? "MP CONECTADO" : "SIN MP"}
          </span>
        </button>
      `;
    })
    .join("");

  renderDetail(selectedUser);
};

const updatePagination = () => {
  const totalPages = Math.max(1, Number(state.totalPages) || 1);
  if (pageElement) {
    const totalLabel = state.total === 1 ? "1 usuario" : `${state.total} usuarios`;
    pageElement.textContent = `Pagina ${state.page} de ${totalPages} · ${totalLabel}`;
  }
  if (prevButton) prevButton.disabled = state.page <= 1;
  if (nextButton) nextButton.disabled = !state.hasMore;
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

  const params = new URLSearchParams({
    page: String(state.page),
    perPage: String(state.perPage),
  });
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
    state.totalPages = 0;
    renderUsers();
    updatePagination();
    return;
  }

  state.users = Array.isArray(payload?.users) ? payload.users : [];
  const pagination = payload?.pagination ?? {};
  state.page = Number(pagination.page) || state.page;
  state.hasMore = Boolean(pagination.hasMore);
  state.total = Number(pagination.total) || state.users.length;
  state.totalPages = Number(pagination.totalPages) || (state.total > 0 ? 1 : 0);
  if (!state.users.some((user) => user.id === state.selectedId)) {
    state.selectedId = state.users[0]?.id ?? "";
  }
  const loadedCount = state.users.length;
  const totalText = state.total === 1 ? "1 usuario" : `${state.total} usuarios`;
  setStatus(
    state.query
      ? `Resultados para "${state.query}": ${totalText}.`
      : `Usuarios cargados: ${totalText}. Mostrando ${loadedCount}.`,
  );
  renderUsers();
  updatePagination();
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
  const confirmed = await confirmPasswordReset(selectedUser);
  if (!confirmed) return;

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
      body: JSON.stringify({ user_id: selectedUser.id }),
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

const runSearch = () => {
  state.query = String(searchInput?.value ?? "").trim();
  state.page = 1;
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
  state.page = 1;
  state.selectedId = "";
  fetchUsers().catch(() => setStatus("No se pudieron cargar los usuarios."));
});
prevButton?.addEventListener("click", () => {
  if (state.page <= 1) return;
  state.page -= 1;
  fetchUsers().catch(() => setStatus("No se pudieron cargar los usuarios."));
});
nextButton?.addEventListener("click", () => {
  if (!state.hasMore || state.query) return;
  state.page += 1;
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
