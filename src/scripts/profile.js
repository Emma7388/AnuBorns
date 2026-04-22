/* Perfil de usuario: lectura, edición y avatar. */
import { supabase } from "../lib/supabaseClient";
import { postAudit } from "./audit.js";

/* Referencias DOM principales. */
const status = document.getElementById("profile-status");
const card = document.getElementById("profile-card");
const avatarImg = document.getElementById("profile-avatar");
const avatarInput = document.getElementById("avatar-upload");
const avatarFeedback = document.getElementById("avatar-feedback");
const profileForm = document.getElementById("profile-form");
const profileFeedback = document.getElementById("profile-feedback");
const profileToggle = document.getElementById("profile-edit-toggle");
const emailInput = document.getElementById("profile-email");
const firstNameInput = document.getElementById("profile-first-name");
const lastNameInput = document.getElementById("profile-last-name");
const phoneInput = document.getElementById("profile-phone");
const dniInput = document.getElementById("profile-dni");
const addressInput = document.getElementById("profile-address");
const cityInput = document.getElementById("profile-city");
const provinceInput = document.getElementById("profile-province");
const postalInput = document.getElementById("profile-postal-code");

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
  if (runId === loadRunId && status) {
    status.textContent = "Información actualizada.";
  }
};

/* Sube avatar que quedó pendiente en localStorage. */
const uploadPendingAvatar = async (session) => {
  try {
    const raw = window.localStorage.getItem("ab_pending_avatar");
    if (!raw) return;
    const pending = JSON.parse(raw);
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
      if (avatarFeedback) avatarFeedback.textContent = "Avatar actualizado.";
    }
  } catch {
    // noop
  }
};

/* Alterna entre modo lectura y edición. */
const setFormVisible = (isVisible) => {
  if (!profileToggle) return;
  document.body.classList.toggle("is-profile-editing", isVisible);
  profileToggle.textContent = isVisible ? "Cancelar edición" : "Editar perfil";
  profileToggle.setAttribute("aria-expanded", String(isVisible));
};

/* Estado inicial del formulario. */
setFormVisible(false);

const resetProfileView = () => {
  setFormVisible(false);
};

/* Re-carga en navegación Astro. */
document.addEventListener("astro:page-load", () => {
  resetProfileView();
  loadProfile();
});
document.addEventListener("astro:after-swap", () => {
  resetProfileView();
  loadProfile();
});
document.addEventListener("astro:before-swap", () => {
  loadRunId += 1;
  resetProfileView();
});
window.addEventListener("pageshow", () => {
  resetProfileView();
  loadProfile();
});

/* Toggle de edición. */
profileToggle?.addEventListener("click", () => {
  const isEditing = document.body.classList.contains("is-profile-editing");
  setFormVisible(!isEditing);
});

/* Submit del formulario de perfil. */
profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
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
});

/* Upload de avatar desde el formulario. */
avatarInput?.addEventListener("change", async () => {
  const file = avatarInput.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    if (avatarFeedback) avatarFeedback.textContent = "El archivo debe ser una imagen.";
    return;
  }

  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    if (avatarFeedback) avatarFeedback.textContent = "El avatar supera el tamaño máximo de 2MB.";
    return;
  }

  if (avatarFeedback) avatarFeedback.textContent = "Subiendo avatar...";

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
      if (avatarFeedback) avatarFeedback.textContent = "Avatar actualizado.";
    } else if (avatarFeedback) {
      avatarFeedback.textContent = "No se pudo obtener URL del avatar.";
    }
  } catch (error) {
    console.error("Avatar upload error", error);
    if (avatarFeedback) avatarFeedback.textContent = "Error subiendo avatar.";
  }
});
