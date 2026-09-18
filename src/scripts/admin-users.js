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

const renderDetailRow = (label, value) => `
  <div class="ab-admin-users__detail-row">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(valueOrDash(value))}</strong>
  </div>
`;

const renderDetail = (user) => {
  if (!detailElement) return;
  if (!user) {
    detailElement.innerHTML = `<p class="ab-muted-text">Seleccioná un usuario para ver sus datos.</p>`;
    return;
  }

  const name = fullName(user) || "Usuario sin nombre";
  detailElement.innerHTML = `
    <div class="ab-admin-users__detail-head">
      <h2>${escapeHtml(name)}</h2>
      <p>${escapeHtml(user.email || "Sin email")}</p>
    </div>
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
    ${renderDetailRow("Mercado Pago", user.mercado_pago?.connected ? "Conectado" : "No conectado")}
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
      return `
        <button type="button" class="ab-admin-user-card${selected ? " is-selected" : ""}" data-user-id="${escapeHtml(user.id)}">
          <span>
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(user.email || "Sin email")}</small>
          </span>
          <span class="ab-admin-user-card__meta">
            ${user.mercado_pago?.connected ? "MP conectado" : "Sin MP"}
          </span>
        </button>
      `;
    })
    .join("");

  renderDetail(selectedUser);
};

const updatePagination = () => {
  if (pageElement) pageElement.textContent = `Página ${state.page}`;
  if (prevButton) prevButton.disabled = state.page <= 1;
  if (nextButton) nextButton.disabled = !state.hasMore || Boolean(state.query);
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
    renderUsers();
    updatePagination();
    return;
  }

  state.users = Array.isArray(payload?.users) ? payload.users : [];
  state.hasMore = Boolean(payload?.pagination?.hasMore);
  if (!state.users.some((user) => user.id === state.selectedId)) {
    state.selectedId = state.users[0]?.id ?? "";
  }
  setStatus(state.query ? `Resultados para "${state.query}".` : "Usuarios cargados.");
  renderUsers();
  updatePagination();
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
  renderUsers();
});

fetchUsers().catch(() => setStatus("No se pudieron cargar los usuarios."));
