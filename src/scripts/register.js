/* Formulario de registro: validaciones y alta de usuario. */
import { supabase } from "../lib/supabaseClient";
import { AVATAR_MAX_BYTES, resizeAvatarImage } from "../lib/imageResize";
import { PENDING_AVATAR_KEY } from "../lib/pendingAvatar";
import {
  clearPendingRegistrationProfile,
  savePendingRegistrationProfile,
  upsertUserProfile,
} from "../lib/userProfile";

/* Referencias DOM (re-consultadas en navegación de Astro). */
let registerForm = document.getElementById("register-form");
let feedback = document.getElementById("register-feedback");
let emailInput = document.getElementById("email");
let passwordInput = document.getElementById("password");
let passwordConfirm = document.getElementById("password-confirm");
let submitButton = document.getElementById("register-submit");
let avatarInput = document.getElementById("avatar");
let avatarPreviewImg = document.getElementById("register-avatar-preview");
let firstName = document.getElementById("first-name");
let lastName = document.getElementById("last-name");
let phone = document.getElementById("phone");
let dni = document.getElementById("dni");
let address = document.getElementById("address");
let city = document.getElementById("city");
let province = document.getElementById("province");
let postal = document.getElementById("postal-code");
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const REGISTER_TEXT_MAX = {
  name: 60,
  address: 120,
  place: 80,
  postal: 10,
};
let isRegistering = false;
let isRegistrationComplete = false;
let avatarPreviewUrl = "";

const isRegisterPageActive = () => window.location.pathname === "/registro";

/* Si el usuario ya quedó autenticado (por ejemplo desde otra pestaña), avanza al perfil. */
supabase.auth.onAuthStateChange((_event, session) => {
  if (isRegisterPageActive() && session?.user && !isRegistering) {
    window.location.replace("/mis-datos");
  }
});

/* Ayudantes para volver a vincular elementos tras navegaciones de Astro. */
const bindRegisterElements = () => {
  registerForm = document.getElementById("register-form");
  feedback = document.getElementById("register-feedback");
  emailInput = document.getElementById("email");
  passwordInput = document.getElementById("password");
  passwordConfirm = document.getElementById("password-confirm");
  submitButton = document.getElementById("register-submit");
  avatarInput = document.getElementById("avatar");
  avatarPreviewImg = document.getElementById("register-avatar-preview");
  firstName = document.getElementById("first-name");
  lastName = document.getElementById("last-name");
  phone = document.getElementById("phone");
  dni = document.getElementById("dni");
  address = document.getElementById("address");
  city = document.getElementById("city");
  province = document.getElementById("province");
  postal = document.getElementById("postal-code");
};

const bindRegisterEvents = () => {
  if (!registerForm) return;
  if (registerForm.dataset.abRegisterBound === "true") return;
  registerForm.dataset.abRegisterBound = "true";
  registerForm.addEventListener("submit", handleRegisterSubmit);
  if (avatarInput) avatarInput.addEventListener("change", handleAvatarPreviewChange);
  [phone, dni].forEach((input) => {
    if (!input || input.dataset.abRegisterSanitizeBound === "true") return;
    input.addEventListener("input", handleDigitsOnlyInput);
    input.dataset.abRegisterSanitizeBound = "true";
  });
  [firstName, lastName, address, city, province, postal].forEach((input) => {
    if (!input || input.dataset.abRegisterValidationBound === "true") return;
    input.addEventListener("input", () => setFieldError(input, ""));
    input.dataset.abRegisterValidationBound = "true";
  });
};

const normalizeWhitespace = (value, maxLength) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const normalizePersonName = (value) =>
  normalizeWhitespace(value, REGISTER_TEXT_MAX.name)
    .replace(/[^\p{L}\p{M}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeDigits = (value, maxLength) =>
  String(value ?? "").replace(/\D/g, "").slice(0, maxLength);

const normalizeAddress = (value) =>
  normalizeWhitespace(value, REGISTER_TEXT_MAX.address)
    .replace(/[<>]/g, "")
    .trim();

const normalizePlace = (value) =>
  normalizeWhitespace(value, REGISTER_TEXT_MAX.place)
    .replace(/[^\p{L}\p{M}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizePostalCode = (value) =>
  normalizeWhitespace(value, REGISTER_TEXT_MAX.postal)
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

const validateRegisterForm = () => {
  const values = {
    firstName: normalizePersonName(firstName?.value),
    lastName: normalizePersonName(lastName?.value),
    phone: normalizeDigits(phone?.value, 15),
    dni: normalizeDigits(dni?.value, 8),
    address: normalizeAddress(address?.value),
    city: normalizePlace(city?.value),
    province: normalizePlace(province?.value),
    postalCode: normalizePostalCode(postal?.value),
  };

  if (firstName) firstName.value = values.firstName;
  if (lastName) lastName.value = values.lastName;
  if (phone) phone.value = values.phone;
  if (dni) dni.value = values.dni;
  if (address) address.value = values.address;
  if (city) city.value = values.city;
  if (province) province.value = values.province;
  if (postal) postal.value = values.postalCode;

  const errors = [];
  markField(firstName, values.firstName.length < 2 ? "Ingresá un nombre válido." : "", errors);
  markField(lastName, values.lastName.length < 2 ? "Ingresá un apellido válido." : "", errors);
  markField(phone, values.phone.length < 8 ? "Ingresá un teléfono válido, solo números." : "", errors);
  markField(dni, values.dni.length < 7 || values.dni.length > 8 ? "Ingresá un DNI válido, solo números." : "", errors);
  markField(address, values.address.length < 4 ? "Ingresá una dirección más completa." : "", errors);
  markField(city, values.city.length < 2 ? "Ingresá una ciudad válida." : "", errors);
  markField(province, values.province.length < 2 ? "Ingresá una provincia válida." : "", errors);
  markField(postal, values.postalCode.length < 4 ? "Ingresá un código postal válido." : "", errors);

  return { ok: errors.length === 0, values, errors };
};

const getImageExtension = (type) => {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("file_read_error"));
    reader.readAsDataURL(file);
  });

const savePendingAvatar = async (file) => {
  const dataUrl = await readFileAsDataUrl(file);
  const payload = {
    name: file.name,
    type: file.type,
    dataUrl,
    savedAt: Date.now(),
  };
  window.localStorage.setItem(PENDING_AVATAR_KEY, JSON.stringify(payload));
};

const clearAvatarPreview = () => {
  if (avatarPreviewUrl) {
    URL.revokeObjectURL(avatarPreviewUrl);
    avatarPreviewUrl = "";
  }
  if (!avatarPreviewImg) return;
  avatarPreviewImg.removeAttribute("src");
  avatarPreviewImg.style.display = "none";
  avatarPreviewImg.closest(".ab-register-avatar-preview")?.classList.add("ab-is-hidden");
};

const showAvatarPreview = (file) => {
  if (!avatarPreviewImg || !file) return;
  if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
  avatarPreviewUrl = URL.createObjectURL(file);
  avatarPreviewImg.src = avatarPreviewUrl;
  avatarPreviewImg.style.display = "block";
  avatarPreviewImg.closest(".ab-register-avatar-preview")?.classList.remove("ab-is-hidden");
};

function handleDigitsOnlyInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const maxLength = Number(target.getAttribute("maxlength")) || 15;
  target.value = normalizeDigits(target.value, maxLength);
  setFieldError(target, "");
}

function handleAvatarPreviewChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const file = target.files?.[0] ?? null;
  if (!file) {
    clearAvatarPreview();
    return;
  }
  if (!ALLOWED_AVATAR_TYPES.has(file.type) || file.size > AVATAR_MAX_BYTES) {
    clearAvatarPreview();
    return;
  }
  showAvatarPreview(file);
}

/* Envío del formulario de registro (manejador reutilizable). */
const handleRegisterSubmit = async (event) => {
  event.preventDefault();
  if (!emailInput || !passwordInput || !passwordConfirm || !feedback) return;
  if (isRegistrationComplete) return;
  if (isRegistering) return;

  const validation = validateRegisterForm();
  if (!validation.ok) {
    const firstError = validation.errors[0];
    feedback.textContent = firstError?.message ?? "Revisá los datos ingresados.";
    firstError?.input?.focus();
    return;
  }

  isRegistering = true;
  if (submitButton) submitButton.disabled = true;
  feedback.textContent = "Creando cuenta...";

  /* Captura y valida inputs. */
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirm = passwordConfirm.value;
  const avatarFile = avatarInput?.files?.[0] ?? null;
  let optimizedAvatarFile = null;

  try {
    if (!email || !password) {
      feedback.textContent = "Email y contraseña son obligatorios.";
      return;
    }

    if (password !== confirm) {
      feedback.textContent = "Las contraseñas no coinciden.";
      return;
    }

    if (password.length < 6) {
      feedback.textContent = "La contraseña debe tener al menos 6 caracteres.";
      return;
    }

    /* Validación de avatar si se adjunta. */
    if (avatarFile) {
      if (!ALLOWED_AVATAR_TYPES.has(avatarFile.type)) {
        if (avatarInput) avatarInput.value = "";
        clearAvatarPreview();
        feedback.textContent = "El avatar debe ser JPG, PNG o WEBP.";
        return;
      }
      if (avatarFile.size > AVATAR_MAX_BYTES) {
        if (avatarInput) avatarInput.value = "";
        clearAvatarPreview();
        feedback.textContent = "El avatar supera el tamaño máximo de 5MB.";
        return;
      }
      optimizedAvatarFile = await resizeAvatarImage(avatarFile);
      if (!ALLOWED_AVATAR_TYPES.has(optimizedAvatarFile.type)) {
        if (avatarInput) avatarInput.value = "";
        clearAvatarPreview();
        feedback.textContent = "No se pudo preparar el avatar. Probá con JPG, PNG o WEBP.";
        return;
      }
    }

    try {
      savePendingRegistrationProfile(validation.values);
    } catch {
      feedback.textContent = "No se pudieron preparar tus datos. Revisá permisos del navegador e intentá de nuevo.";
      return;
    }

    /* Registro en Supabase. */
    const emailRedirectTo = `${window.location.origin}/auth/callback?returnTo=/mis-datos`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });

    if (error) {
      clearPendingRegistrationProfile();
      feedback.textContent = `Error: ${error.message}`;
      return;
    }

    /* Si hay sesión, sube avatar y actualiza perfil. */
    if (data?.session) {
      const userId = data.session.user.id;
      const { error: profileError } = await upsertUserProfile(userId, validation.values);
      if (profileError) {
        feedback.textContent = "Cuenta creada, pero no se pudieron guardar tus datos. Ejecutá el SQL de perfiles y completalos en Mis datos.";
        isRegistrationComplete = true;
        return;
      }
      clearPendingRegistrationProfile();

      if (optimizedAvatarFile) {
        try {
          const extension = getImageExtension(optimizedAvatarFile.type);
          const filePath = `${userId}/avatar-${Date.now()}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from("avatar")
            .upload(filePath, optimizedAvatarFile, { upsert: true, contentType: optimizedAvatarFile.type });

          if (uploadError) {
            console.warn("Avatar upload error", uploadError);
          } else {
            const { data: publicData } = supabase.storage.from("avatar").getPublicUrl(filePath);
            const avatarUrl = publicData?.publicUrl ?? "";
            if (avatarUrl) {
              await supabase.auth.updateUser({
                data: { avatar_url: avatarUrl },
              });
            }
          }
        } catch (uploadError) {
          console.warn("Avatar upload error", uploadError);
        }
      }

      feedback.textContent = "Cuenta creada. Redirigiendo...";
      isRegistrationComplete = true;
      window.location.href = "/mis-datos";
      return;
    }

    /* Si no hay sesión inmediata, guarda avatar para subir luego. */
    if (optimizedAvatarFile) {
      try {
        await savePendingAvatar(optimizedAvatarFile);
      } catch (storageError) {
        console.warn("Pending avatar save error", storageError);
        feedback.textContent =
          "Cuenta creada. Revisá tu email para confirmar el acceso. No se pudo guardar el avatar, podés cargarlo después.";
        isRegistrationComplete = true;
        return;
      }
    }

    /* Mensaje final cuando requiere confirmación por email. */
    feedback.textContent =
      optimizedAvatarFile
        ? "Cuenta creada. Revisá tu email para confirmar el acceso. El avatar se subirá cuando inicies sesión."
        : "Cuenta creada. Revisá tu email para confirmar el acceso.";
    isRegistrationComplete = true;
  } finally {
    isRegistering = false;
    if (submitButton) submitButton.disabled = isRegistrationComplete;
  }
};

/* Inicialización y eventos de navegación de Astro. */
bindRegisterElements();
bindRegisterEvents();
document.addEventListener("astro:page-load", () => {
  bindRegisterElements();
  bindRegisterEvents();
});
document.addEventListener("astro:after-swap", () => {
  bindRegisterElements();
  bindRegisterEvents();
});
window.addEventListener("pageshow", () => {
  bindRegisterElements();
  bindRegisterEvents();
});
