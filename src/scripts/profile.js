/* Perfil de usuario: lectura, edición y avatar. */
import { supabase } from "../lib/supabaseClient";
import { postAudit } from "./audit.js";
import { fetchSalesSummary } from "../lib/salesSummaryClient";
import { shouldNotifyPurchaseStatus } from "../lib/purchaseStatusMessages";

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
const PENDING_AVATAR_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 2; // 48 horas
const LAST_SEEN_SALE_KEY = "ab_last_seen_sale_at_v1";

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
}

/* Convierte dataURL a Blob para subir a storage. */
const dataUrlToBlob = (dataUrl) => {
  const parts = dataUrl.split(",");
  const match = parts[0].match(/data:(.*);base64/);
  if (!match) return null;
  const contentType = match[1];
  const byteString = atob(parts[1]);
  const buffer = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i += 1) {
    buffer[i] = byteString.charCodeAt(i);
  }
  return new Blob([buffer], { type: contentType });
};

/* Render de filas del resumen en la tarjeta. */
const formatRow = (label, value) => `
  <div class="ab-profile-data__row">
    <span class="ab-profile-data__label">${label}</span>
    <span class="ab-profile-data__value">${value || "-"}</span>
  </div>
`;

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
      // ignore
    }
  }

  if (!session?.user) {
    if (status && runId === loadRunId) {
      status.textContent = "Tenés que iniciar sesión para ver tus datos.";
    }
    window.location.href = "/login?returnTo=/mis-datos";
    return;
  }

  /* Datos base y metadata de perfil. */
  const user = session.user;
  const metadata = user.user_metadata ?? {};
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
      formatRow("Nombre", metadata.first_name ?? ""),
      formatRow("Apellido", metadata.last_name ?? ""),
      formatRow("Teléfono", metadata.phone ?? ""),
      formatRow("Documento", metadata.dni ?? ""),
      formatRow("Dirección", metadata.address ?? ""),
      formatRow("Ciudad", metadata.city ?? ""),
      formatRow("Provincia", metadata.province ?? ""),
      formatRow("Código postal", metadata.postal_code ?? ""),
    ].join("");
  }

  if (emailInput) emailInput.value = user.email ?? "";
  if (firstNameInput) firstNameInput.value = metadata.first_name ?? "";
  if (lastNameInput) lastNameInput.value = metadata.last_name ?? "";
  if (phoneInput) phoneInput.value = metadata.phone ?? "";
  if (dniInput) dniInput.value = metadata.dni ?? "";
  if (addressInput) addressInput.value = metadata.address ?? "";
  if (cityInput) cityInput.value = metadata.city ?? "";
  if (provinceInput) provinceInput.value = metadata.province ?? "";
  if (postalInput) postalInput.value = metadata.postal_code ?? "";

  /* Sube avatar pendiente si fue guardado en registro. */
  await uploadPendingAvatar(session);
  await refreshSalesNotification(session);
  await refreshPurchasesNotification(session);
  if (runId === loadRunId && status) {
    const updatedAt = formatProfileUpdatedAt(user.updated_at);
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

/* Sube avatar que quedó pendiente en localStorage. */
const uploadPendingAvatar = async (session) => {
  try {
    const raw = window.localStorage.getItem("ab_pending_avatar");
    if (!raw) return;
    const pending = JSON.parse(raw);
    const savedAt = Number(pending?.savedAt ?? 0);
    if (!savedAt || Date.now() - savedAt > PENDING_AVATAR_MAX_AGE_MS) {
      window.localStorage.removeItem("ab_pending_avatar");
      return;
    }
    if (!pending?.dataUrl || !pending?.type) return;
    const blob = dataUrlToBlob(pending.dataUrl);
    if (!blob) return;

    const extension = (pending.name || "avatar.jpg").split(".").pop() || "jpg";
    const filePath = `${session.user.id}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("avatar")
      .upload(filePath, blob, { upsert: true, contentType: pending.type });

    if (uploadError) {
      return;
    }

    const { data: publicData } = supabase.storage.from("avatar").getPublicUrl(filePath);
    const avatarUrl = publicData?.publicUrl ?? "";
    if (avatarUrl) {
      await supabase.auth.updateUser({
        data: { avatar_url: avatarUrl },
      });
      if (avatarImg) {
        avatarImg.src = avatarUrl;
        avatarImg.style.display = "block";
      }
      window.localStorage.removeItem("ab_pending_avatar");
      if (avatarFeedback) avatarFeedback.textContent = "Imagen de perfil actualizada.";
    }
  } catch {
    // noop
  }
};

/* Alterna entre modo lectura y edición. */
const setFormVisible = (isVisible) => {
  refreshProfileNodes();
  if (!profileToggle) return;
  document.body.classList.toggle("is-profile-editing", isVisible);
  profileToggle.textContent = isVisible ? "Cancelar edición" : "Editar perfil";
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
  if (profileFeedback) profileFeedback.textContent = "Guardando...";

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.user) {
    if (profileFeedback) profileFeedback.textContent = "Tenés que iniciar sesión.";
    return;
  }

  const { error } = await supabase.auth.updateUser({
    data: {
      first_name: firstNameInput?.value ?? "",
      last_name: lastNameInput?.value ?? "",
      phone: phoneInput?.value ?? "",
      dni: dniInput?.value ?? "",
      address: addressInput?.value ?? "",
      city: cityInput?.value ?? "",
      province: provinceInput?.value ?? "",
      postal_code: postalInput?.value ?? "",
    },
  });

  if (error) {
    if (profileFeedback) profileFeedback.textContent = `Error: ${error.message}`;
    return;
  }

  if (profileFeedback) profileFeedback.textContent = "Datos actualizados.";
  postAudit("profile_update").catch(() => {});
  setFormVisible(false);
  loadProfile();
}

async function handleAvatarChange(event) {
  refreshProfileNodes();
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const file = target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    if (avatarFeedback) avatarFeedback.textContent = "El archivo debe ser una imagen.";
    return;
  }

  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    if (avatarFeedback) avatarFeedback.textContent = "La imagen de perfil supera el tamaño máximo de 2MB.";
    return;
  }

  if (avatarFeedback) avatarFeedback.textContent = "Subiendo imagen de perfil...";

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.user) {
    if (avatarFeedback) avatarFeedback.textContent = "Tenés que iniciar sesión.";
    return;
  }

  try {
    const extension = file.name.split(".").pop() || "jpg";
    const filePath = `${session.user.id}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("avatar")
      .upload(filePath, file, { upsert: true, contentType: file.type });

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
