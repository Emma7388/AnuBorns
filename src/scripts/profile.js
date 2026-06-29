/* Perfil de usuario: lectura, edición y avatar. */
import { supabase } from "../lib/supabaseClient";
import { postAudit } from "./audit.js";
import { fetchSalesSummary } from "../lib/salesSummaryClient";
import { shouldNotifyPurchaseStatus } from "../lib/purchaseStatusMessages";
import { uploadPendingAvatar as uploadStoredPendingAvatar, withAvatarUrl } from "../lib/pendingAvatar";
import { AVATAR_MAX_BYTES, resizeAvatarImage } from "../lib/imageResize";
import {
  fetchUserProfile,
  resolvePendingRegistrationProfile,
  upsertUserProfile,
} from "../lib/userProfile";

/* Referencias DOM principales. */
let status = document.getElementById("profile-status");
let card = document.getElementById("profile-card");
let avatarImg = document.getElementById("profile-avatar");
let avatarInput = document.getElementById("avatar-upload");
let avatarFeedback = document.getElementById("avatar-feedback");
let profileForm = document.getElementById("profile-form");
let profileFeedback = document.getElementById("profile-feedback");
let profileToggle = document.getElementById("profile-edit-toggle");
let emailInput = document.getElementById("profile-email");
let firstNameInput = document.getElementById("profile-first-name");
let lastNameInput = document.getElementById("profile-last-name");
let phoneInput = document.getElementById("profile-phone");
let dniInput = document.getElementById("profile-dni");
let addressInput = document.getElementById("profile-address");
let cityInput = document.getElementById("profile-city");
let provinceInput = document.getElementById("profile-province");
let postalInput = document.getElementById("profile-postal-code");
let salesNotificationDot = document.getElementById("my-sales-notification-dot");
let purchasesNotificationDot = document.getElementById("my-purchases-notification-dot");
const LAST_SEEN_SALE_KEY = "ab_last_seen_sale_at_v1";
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PROFILE_TEXT_MAX = {
  name: 60,
  address: 120,
  place: 80,
  postal: 10,
};
let isSavingProfile = false;
let avatarPreviewUrl = "";

const isProfilePageActive = () => window.location.pathname === "/mis-datos";

const refreshProfileNodes = () => {
  status = document.getElementById("profile-status");
  card = document.getElementById("profile-card");
  avatarImg = document.getElementById("profile-avatar");
  avatarInput = document.getElementById("avatar-upload");
  avatarFeedback = document.getElementById("avatar-feedback");
  profileForm = document.getElementById("profile-form");
  profileFeedback = document.getElementById("profile-feedback");
  profileToggle = document.getElementById("profile-edit-toggle");
  emailInput = document.getElementById("profile-email");
  firstNameInput = document.getElementById("profile-first-name");
  lastNameInput = document.getElementById("profile-last-name");
  phoneInput = document.getElementById("profile-phone");
  dniInput = document.getElementById("profile-dni");
  addressInput = document.getElementById("profile-address");
  cityInput = document.getElementById("profile-city");
  provinceInput = document.getElementById("profile-province");
  postalInput = document.getElementById("profile-postal-code");
  salesNotificationDot = document.getElementById("my-sales-notification-dot");
  purchasesNotificationDot = document.getElementById("my-purchases-notification-dot");
};

const bindProfileEvents = () => {
  refreshProfileNodes();
  if (profileToggle && profileToggle.dataset.abProfileEventsBound !== "true") {
    profileToggle.addEventListener("click", handleProfileToggleClick);
    profileToggle.dataset.abProfileEventsBound = "true";
  }
  if (profileForm && profileForm.dataset.abProfileEventsBound !== "true") {
    profileForm.addEventListener("submit", handleProfileFormSubmit);
    profileForm.dataset.abProfileEventsBound = "true";
  }
  if (avatarInput && avatarInput.dataset.abProfileEventsBound !== "true") {
    avatarInput.addEventListener("change", handleAvatarChange);
    avatarInput.dataset.abProfileEventsBound = "true";
  }
  if (card && card.dataset.abProfileSensitiveBound !== "true") {
    card.addEventListener("click", handleSensitiveToggleClick);
    card.dataset.abProfileSensitiveBound = "true";
  }
  [phoneInput, dniInput].forEach((input) => {
    if (!input || input.dataset.abProfileSanitizeBound === "true") return;
    input.addEventListener("input", handleDigitsOnlyInput);
    input.dataset.abProfileSanitizeBound = "true";
  });
  [firstNameInput, lastNameInput, addressInput, cityInput, provinceInput, postalInput].forEach((input) => {
    if (!input || input.dataset.abProfileValidationBound === "true") return;
    input.addEventListener("input", () => setFieldError(input, ""));
    input.dataset.abProfileValidationBound = "true";
  });
};

function handleSensitiveToggleClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const toggle = target.closest("[data-profile-sensitive-toggle]");
  if (!(toggle instanceof HTMLButtonElement)) return;

  const row = toggle.closest(".ab-profile-data__row");
  const valueElement = row?.querySelector(".ab-profile-data__value");
  const icon = toggle.querySelector("img");
  if (!(valueElement instanceof HTMLElement)) return;

  const isVisible = toggle.getAttribute("aria-pressed") === "true";
  const nextVisible = !isVisible;
  const label = row?.querySelector(".ab-profile-data__label")?.textContent?.trim() || "dato";
  valueElement.textContent = nextVisible
    ? valueElement.dataset.sensitiveValue || "-"
    : MASKED_PROFILE_VALUE;
  toggle.setAttribute("aria-pressed", String(nextVisible));
  toggle.setAttribute("aria-label", `${nextVisible ? "Ocultar" : "Mostrar"} ${label}`);
  toggle.setAttribute("title", `${nextVisible ? "Ocultar" : "Mostrar"} ${label}`);
  if (icon) icon.src = nextVisible ? "/icons/ojo-cerrado.svg" : "/icons/ojo.svg";
}

const PROFILE_FIELD_ICONS = {
  Email: "/icons/correo-electronico.svg",
  Nombre: "/icons/proveedor.svg",
  Apellido: "/icons/proveedor.svg",
  "Teléfono": "/icons/telefono.svg",
  Documento: "/icons/licencia.svg",
  "Dirección": "/icons/casa.svg",
  Ciudad: "/icons/ciudad.svg",
  Provincia: "/icons/provincia.svg",
  "Código postal": "/icons/codigo-postal.svg",
};
const SENSITIVE_PROFILE_LABELS = new Set(["Documento", "Dirección"]);
const MASKED_PROFILE_VALUE = "••••••••";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatSensitiveToggle = (label) => {
  const safeLabel = escapeHtml(label);
  return `
    <button
      class="ab-profile-data__toggle"
      type="button"
      data-profile-sensitive-toggle
      aria-label="Mostrar ${safeLabel}"
      aria-pressed="false"
      title="Mostrar ${safeLabel}"
    >
      <img src="/icons/ojo.svg" alt="" aria-hidden="true" />
    </button>
  `;
};

/* Render de filas del resumen en la tarjeta. */
const formatRow = (label, value) => {
  const icon = PROFILE_FIELD_ICONS[label] ?? "/icons/detalle.svg";
  const safeLabel = escapeHtml(label);
  const rawValue = String(value ?? "").trim();
  const hasValue = rawValue.length > 0;
  const isSensitive = SENSITIVE_PROFILE_LABELS.has(label) && hasValue;
  const safeValue = escapeHtml(hasValue ? rawValue : "-");
  const visibleValue = isSensitive ? MASKED_PROFILE_VALUE : safeValue;
  return `
    <div class="ab-profile-data__row${isSensitive ? " ab-profile-data__row--sensitive" : ""}">
      <span class="ab-profile-data__icon" title="${safeLabel}" aria-hidden="true">
        <img src="${icon}" alt="" />
      </span>
      <span class="ab-profile-data__content">
        <span class="ab-profile-data__label">${safeLabel}</span>
        <span class="ab-profile-data__value"${isSensitive ? ` data-sensitive-value="${safeValue}"` : ""}>${visibleValue}</span>
      </span>
      ${isSensitive ? formatSensitiveToggle(label) : ""}
    </div>
  `;
};

const setProfileToggleContent = (isEditing) => {
  if (!profileToggle) return;
  const icon = isEditing ? "/icons/atras.svg" : "/icons/detalle.svg";
  const text = isEditing ? "Cancelar edición" : "Editar perfil";
  profileToggle.innerHTML = `<img src="${icon}" alt="" aria-hidden="true" /><span>${text}</span>`;
};

const normalizeWhitespace = (value, maxLength) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const normalizePersonName = (value) =>
  normalizeWhitespace(value, PROFILE_TEXT_MAX.name)
    .replace(/[^\p{L}\p{M}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeAddress = (value) =>
  normalizeWhitespace(value, PROFILE_TEXT_MAX.address)
    .replace(/[<>]/g, "")
    .trim();

const normalizePlace = (value) =>
  normalizeWhitespace(value, PROFILE_TEXT_MAX.place)
    .replace(/[^\p{L}\p{M}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeDigits = (value, maxLength) =>
  String(value ?? "").replace(/\D/g, "").slice(0, maxLength);

const normalizePostalCode = (value) =>
  normalizeWhitespace(value, PROFILE_TEXT_MAX.postal)
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .toUpperCase()
    .trim();

const setFieldError = (input, message) => {
  if (!input) return;
  input.setCustomValidity(message);
  input.setAttribute("aria-invalid", message ? "true" : "false");
};

const markField = (input, message, errors) => {
  setFieldError(input, message);
  if (message) errors.push({ input, message });
};

const validateProfileForm = () => {
  const values = {
    firstName: normalizePersonName(firstNameInput?.value),
    lastName: normalizePersonName(lastNameInput?.value),
    phone: normalizeDigits(phoneInput?.value, 15),
    dni: normalizeDigits(dniInput?.value, 8),
    address: normalizeAddress(addressInput?.value),
    city: normalizePlace(cityInput?.value),
    province: normalizePlace(provinceInput?.value),
    postalCode: normalizePostalCode(postalInput?.value),
  };

  if (firstNameInput) firstNameInput.value = values.firstName;
  if (lastNameInput) lastNameInput.value = values.lastName;
  if (phoneInput) phoneInput.value = values.phone;
  if (dniInput) dniInput.value = values.dni;
  if (addressInput) addressInput.value = values.address;
  if (cityInput) cityInput.value = values.city;
  if (provinceInput) provinceInput.value = values.province;
  if (postalInput) postalInput.value = values.postalCode;

  const errors = [];
  markField(firstNameInput, values.firstName.length < 2 ? "Ingresá un nombre válido." : "", errors);
  markField(lastNameInput, values.lastName.length < 2 ? "Ingresá un apellido válido." : "", errors);
  markField(phoneInput, values.phone.length < 8 ? "Ingresá un teléfono válido, solo números." : "", errors);
  markField(dniInput, values.dni.length < 7 || values.dni.length > 8 ? "Ingresá un DNI válido, solo números." : "", errors);
  markField(addressInput, values.address.length < 4 ? "Ingresá una dirección más completa." : "", errors);
  markField(cityInput, values.city.length < 2 ? "Ingresá una ciudad válida." : "", errors);
  markField(provinceInput, values.province.length < 2 ? "Ingresá una provincia válida." : "", errors);
  markField(postalInput, values.postalCode.length < 4 ? "Ingresá un código postal válido." : "", errors);

  return { ok: errors.length === 0, values, errors };
};

const getImageExtension = (type) => {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
};

const clearAvatarPreviewUrl = () => {
  if (!avatarPreviewUrl) return;
  URL.revokeObjectURL(avatarPreviewUrl);
  avatarPreviewUrl = "";
};

const showLocalAvatarPreview = (file) => {
  if (!avatarImg || !file) return;
  clearAvatarPreviewUrl();
  avatarPreviewUrl = URL.createObjectURL(file);
  avatarImg.src = avatarPreviewUrl;
  avatarImg.style.display = "block";
};

function handleDigitsOnlyInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const maxLength = Number(target.getAttribute("maxlength")) || 15;
  target.value = normalizeDigits(target.value, maxLength);
  setFieldError(target, "");
}

const formatProfileUpdatedAt = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/* Controla que solo la última carga actualice la UI. */
let loadRunId = 0;

/* Timeout utilitario para requests de auth. */
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);

/* Carga datos del usuario y actualiza la UI. */
const loadProfile = async () => {
  refreshProfileNodes();
  if (!isProfilePageActive()) return;

  const runId = (loadRunId += 1);
  if (status) status.textContent = "Cargando información del usuario...";

  let session = null;
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), 8000);
    session = data?.session ?? null;
  } catch {
    session = null;
  }

  if (!session?.user) {
    try {
      const { data: userData } = await withTimeout(supabase.auth.getUser(), 8000);
      if (userData?.user) {
        session = { user: userData.user };
      }
    } catch {
      // Ignora errores de timeout; la carga activa decide el estado final.
    }
  }

  if (!session?.user) {
    if (status && runId === loadRunId) {
      status.textContent = "Tenés que iniciar sesión para ver tus datos.";
    }
    window.location.href = "/login?returnTo=/mis-datos";
    return;
  }

  /* Datos base, avatar pendiente y perfil privado. */
  const pendingAvatarResult = await uploadStoredPendingAvatar(session, {
    onAvatarUrl: (avatarUrl) => {
      if (avatarImg) {
        avatarImg.src = avatarUrl;
        avatarImg.style.display = "block";
      }
    },
  });
  if (pendingAvatarResult?.avatarUrl) {
    session = withAvatarUrl(session, pendingAvatarResult.avatarUrl);
  }
  await resolvePendingRegistrationProfile(session).catch(() => ({ ok: false }));

  const user = session.user;
  const metadata = user.user_metadata ?? {};
  const profile = await fetchUserProfile(user);
  const avatarUrl = metadata.avatar_url;

  if (avatarImg) {
    if (avatarUrl) {
      avatarImg.src = avatarUrl;
      avatarImg.style.display = "block";
    } else {
      avatarImg.removeAttribute("src");
      avatarImg.style.display = "none";
    }
  }

  if (card) {
    card.innerHTML = [
      formatRow("Email", user.email ?? ""),
      formatRow("Nombre", profile.first_name ?? ""),
      formatRow("Apellido", profile.last_name ?? ""),
      formatRow("Teléfono", profile.phone ?? ""),
      formatRow("Documento", profile.dni ?? ""),
      formatRow("Dirección", profile.address ?? ""),
      formatRow("Ciudad", profile.city ?? ""),
      formatRow("Provincia", profile.province ?? ""),
      formatRow("Código postal", profile.postal_code ?? ""),
    ].join("");
  }

  if (emailInput) emailInput.value = user.email ?? "";
  if (firstNameInput) firstNameInput.value = profile.first_name ?? "";
  if (lastNameInput) lastNameInput.value = profile.last_name ?? "";
  if (phoneInput) phoneInput.value = profile.phone ?? "";
  if (dniInput) dniInput.value = profile.dni ?? "";
  if (addressInput) addressInput.value = profile.address ?? "";
  if (cityInput) cityInput.value = profile.city ?? "";
  if (provinceInput) provinceInput.value = profile.province ?? "";
  if (postalInput) postalInput.value = profile.postal_code ?? "";

  await refreshSalesNotification(session);
  await refreshPurchasesNotification(session);
  if (runId === loadRunId && status) {
    const updatedAt = formatProfileUpdatedAt(profile.updated_at || user.updated_at);
    status.textContent = updatedAt
      ? `Información actualizada. Última actualización de datos: ${updatedAt}.`
      : "Información actualizada.";
  }
};

const setSalesDotVisible = (visible) => {
  if (!salesNotificationDot) return;
  if (visible) {
    salesNotificationDot.classList.remove("ab-is-hidden");
    return;
  }
  salesNotificationDot.classList.add("ab-is-hidden");
};

const setPurchasesDotVisible = (visible) => {
  if (!purchasesNotificationDot) return;
  if (visible) {
    purchasesNotificationDot.classList.remove("ab-is-hidden");
    return;
  }
  purchasesNotificationDot.classList.add("ab-is-hidden");
};

const getSalesNotificationCursor = (items) => {
  if (!Array.isArray(items) || items.length === 0) return "";
  let latest = null;
  let latestTime = 0;
  items.forEach((item) => {
    const soldAt = String(item?.lastSoldAt ?? "").trim();
    if (!soldAt) return;
    const soldAtTime = new Date(soldAt).getTime();
    if (Number.isNaN(soldAtTime)) return;
    if (!latest || soldAtTime > latestTime) {
      latest = item;
      latestTime = soldAtTime;
    }
  });
  if (!latest) return "";
  return `${String(latest.lastSoldAt ?? "").trim()}|${String(latest.lastOrderId ?? "").trim()}`;
};

const normalizeSaleCursor = (value) => String(value ?? "").split("::")[0] || "";

const fetchPurchaseOrders = async (userId) => {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return data;
};

const markPurchaseStatusesReadOnServer = async (token, items = []) => {
  const reads = (Array.isArray(items) ? items : [])
    .map((item) => ({
      orderId: String(item?.orderId ?? "").trim(),
      productId: String(item?.productId ?? "").trim(),
      fulfillmentStatus: String(item?.fulfillmentStatus ?? "").trim(),
      statusUpdatedAt: String(item?.statusUpdatedAt ?? "").trim(),
    }))
    .filter((item) => item.orderId && item.productId && item.fulfillmentStatus);
  if (!token || reads.length === 0) return;

  await fetch("/api/purchase-fulfillment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items: reads }),
  }).catch(() => {});
};

const refreshPurchasesNotification = async (session) => {
  const userId = session?.user?.id ?? "";
  const token = session?.access_token ?? "";
  if (!userId || !token) {
    setPurchasesDotVisible(false);
    return;
  }

  try {
    const orders = await fetchPurchaseOrders(userId);
    const orderIds = [...new Set(orders.map((order) => String(order?.id ?? "").trim()).filter(Boolean))];
    if (orderIds.length === 0) {
      setPurchasesDotVisible(false);
      return;
    }

    const response = await fetch(`/api/purchase-fulfillment?orderIds=${encodeURIComponent(orderIds.join(","))}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload?.items)) {
      setPurchasesDotVisible(false);
      return;
    }

    const unreadItems = payload.items.filter((item) => !item?.statusRead);
    if (!payload.hasAnyRead) {
      const baselineItems = unreadItems.filter((item) => !shouldNotifyPurchaseStatus(item));
      if (baselineItems.length > 0) {
        await markPurchaseStatusesReadOnServer(token, baselineItems);
      }
      setPurchasesDotVisible(unreadItems.some(shouldNotifyPurchaseStatus));
      return;
    }

    const baselineItems = unreadItems.filter((item) => !shouldNotifyPurchaseStatus(item));
    if (baselineItems.length > 0) {
      await markPurchaseStatusesReadOnServer(token, baselineItems);
    }
    const hasUnreadNotifiableItems = unreadItems.some(shouldNotifyPurchaseStatus);
    if (!hasUnreadNotifiableItems) {
      setPurchasesDotVisible(false);
      return;
    }

    setPurchasesDotVisible(true);
  } catch {
    setPurchasesDotVisible(false);
  }
};

const refreshSalesNotification = async (session) => {
  const userId = session?.user?.id ?? "";
  const token = session?.access_token ?? "";
  if (!userId || !token || window.location.pathname === "/mis-ventas") {
    setSalesDotVisible(false);
    return;
  }

  try {
    const payload = await fetchSalesSummary(token);
    if (payload.error) {
      setSalesDotVisible(false);
      return;
    }
    const items = payload.items;
    const latestCursor = getSalesNotificationCursor(items);
    if (!latestCursor) {
      setSalesDotVisible(false);
      return;
    }
    const key = `${LAST_SEEN_SALE_KEY}:${userId}`;
    const previousCursor = window.localStorage.getItem(key);
    if (!previousCursor) {
      setSalesDotVisible(true);
      return;
    }
    setSalesDotVisible(normalizeSaleCursor(previousCursor) !== latestCursor);
  } catch {
    setSalesDotVisible(false);
  }
};

/* Alterna entre modo lectura y edición. */
const setFormVisible = (isVisible) => {
  refreshProfileNodes();
  if (!profileToggle) return;
  document.body.classList.toggle("is-profile-editing", isVisible);
  setProfileToggleContent(isVisible);
  profileToggle.setAttribute("aria-expanded", String(isVisible));
};

const resetProfileView = () => {
  refreshProfileNodes();
  setFormVisible(false);
};

const initProfilePage = () => {
  if (!isProfilePageActive()) return;
  refreshProfileNodes();
  bindProfileEvents();
  resetProfileView();
  loadProfile();
};

/* Estado inicial del formulario. */
initProfilePage();

/* Re-carga en navegación Astro. */
document.addEventListener("astro:page-load", initProfilePage);
document.addEventListener("astro:after-swap", initProfilePage);
document.addEventListener("astro:before-swap", () => {
  loadRunId += 1;
  if (!isProfilePageActive()) return;
  refreshProfileNodes();
  resetProfileView();
});
window.addEventListener("pageshow", initProfilePage);
window.addEventListener("storage", (event) => {
  if (!event.key) return;
  if (event.key.includes("ab_last_seen_sale_at_v1")) {
    loadProfile();
  }
});

function handleProfileToggleClick() {
  const isEditing = document.body.classList.contains("is-profile-editing");
  setFormVisible(!isEditing);
}

async function handleProfileFormSubmit(event) {
  event.preventDefault();
  refreshProfileNodes();
  if (isSavingProfile) return;

  const validation = validateProfileForm();
  if (!validation.ok) {
    const firstError = validation.errors[0];
    if (profileFeedback) profileFeedback.textContent = firstError?.message ?? "Revisá los datos ingresados.";
    firstError?.input?.focus();
    return;
  }

  if (profileFeedback) profileFeedback.textContent = "Guardando...";
  isSavingProfile = true;
  const submitButton = profileForm?.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session?.user) {
      if (profileFeedback) profileFeedback.textContent = "Tenés que iniciar sesión.";
      return;
    }

    const { error } = await upsertUserProfile(session.user.id, validation.values);

    if (error) {
      if (profileFeedback) profileFeedback.textContent = "No se pudieron guardar tus datos. Verificá que el SQL de perfiles esté ejecutado.";
      return;
    }

    if (profileFeedback) profileFeedback.textContent = "Datos actualizados.";
    postAudit("profile_update").catch(() => {});
    setFormVisible(false);
    loadProfile();
  } finally {
    isSavingProfile = false;
    if (submitButton) submitButton.disabled = false;
  }
}

async function handleAvatarChange(event) {
  refreshProfileNodes();
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const file = target.files?.[0];
  if (!file) return;

  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    target.value = "";
    clearAvatarPreviewUrl();
    if (avatarFeedback) avatarFeedback.textContent = "El archivo debe ser JPG, PNG o WEBP.";
    return;
  }

  if (file.size > AVATAR_MAX_BYTES) {
    target.value = "";
    clearAvatarPreviewUrl();
    if (avatarFeedback) avatarFeedback.textContent = "La imagen de perfil supera el tamaño máximo de 5MB.";
    return;
  }

  showLocalAvatarPreview(file);
  if (avatarFeedback) avatarFeedback.textContent = "Subiendo imagen de perfil...";

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.user) {
    if (avatarFeedback) avatarFeedback.textContent = "Tenés que iniciar sesión.";
    return;
  }

  try {
    const optimizedFile = await resizeAvatarImage(file);
    const extension = getImageExtension(optimizedFile.type);
    const filePath = `${session.user.id}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("avatar")
      .upload(filePath, optimizedFile, { upsert: true, contentType: optimizedFile.type });

    if (uploadError) {
      if (avatarFeedback) avatarFeedback.textContent = "No se pudo subir el avatar.";
      return;
    }

    const { data: publicData } = supabase.storage.from("avatar").getPublicUrl(filePath);
    const avatarUrl = publicData?.publicUrl ?? "";
    if (avatarUrl) {
      await supabase.auth.updateUser({
        data: { avatar_url: avatarUrl },
      });
      window.localStorage.setItem("ab_auth_refresh", String(Date.now()));
      clearAvatarPreviewUrl();
      if (avatarImg) {
        avatarImg.src = avatarUrl;
        avatarImg.style.display = "block";
      }
      postAudit("avatar_update").catch(() => {});
      if (avatarFeedback) avatarFeedback.textContent = "Imagen de perfil actualizada.";
    } else if (avatarFeedback) {
      avatarFeedback.textContent = "No se pudo obtener la URL de la imagen de perfil.";
    }
  } catch (error) {
    console.error("Avatar upload error", error);
    if (avatarFeedback) avatarFeedback.textContent = "Error subiendo imagen de perfil.";
  }
}
