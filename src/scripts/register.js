/* Formulario de registro: validaciones y alta de usuario. */
import { supabase } from "../lib/supabaseClient";
import { AVATAR_MAX_BYTES, resizeAvatarImage } from "../lib/imageResize";

/* Referencias DOM (re-consultadas en navegación SPA). */
let registerForm = document.getElementById("register-form");
let feedback = document.getElementById("register-feedback");
let emailInput = document.getElementById("email");
let passwordInput = document.getElementById("password");
let passwordConfirm = document.getElementById("password-confirm");
let avatarInput = document.getElementById("avatar");
let firstName = document.getElementById("first-name");
let lastName = document.getElementById("last-name");
let phone = document.getElementById("phone");
let dni = document.getElementById("dni");
let address = document.getElementById("address");
let city = document.getElementById("city");
let province = document.getElementById("province");
let postal = document.getElementById("postal-code");

/* Si el usuario ya quedó autenticado (por ejemplo desde otra pestaña), avanza al perfil. */
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    window.location.replace("/mis-datos");
  }
});

/* Rebind helpers para navegaciones SPA. */
const bindRegisterElements = () => {
  registerForm = document.getElementById("register-form");
  feedback = document.getElementById("register-feedback");
  emailInput = document.getElementById("email");
  passwordInput = document.getElementById("password");
  passwordConfirm = document.getElementById("password-confirm");
  avatarInput = document.getElementById("avatar");
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
};

/* Submit del formulario de registro (handler reutilizable). */
const handleRegisterSubmit = async (event) => {
  event.preventDefault();
  if (!emailInput || !passwordInput || !passwordConfirm || !feedback) return;
  feedback.textContent = "Creando cuenta...";

  /* Captura y valida inputs. */
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirm = passwordConfirm.value;
  const avatarFile = avatarInput?.files?.[0] ?? null;
  let optimizedAvatarFile = null;

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
    const isImage = avatarFile.type.startsWith("image/");
    if (!isImage) {
      feedback.textContent = "El avatar debe ser una imagen.";
      return;
    }
    if (avatarFile.size > AVATAR_MAX_BYTES) {
      feedback.textContent = "El avatar supera el tamaño máximo de 5MB.";
      return;
    }
    optimizedAvatarFile = await resizeAvatarImage(avatarFile);
  }

  /* Registro en Supabase. */
  const emailRedirectTo = `${window.location.origin}/auth/callback?returnTo=/mis-datos`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        first_name: firstName?.value ?? "",
        last_name: lastName?.value ?? "",
        phone: phone?.value ?? "",
        dni: dni?.value ?? "",
        address: address?.value ?? "",
        city: city?.value ?? "",
        province: province?.value ?? "",
        postal_code: postal?.value ?? "",
      },
    },
  });

  if (error) {
    feedback.textContent = `Error: ${error.message}`;
    return;
  }

  /* Si hay sesión, sube avatar y actualiza perfil. */
  if (data?.session) {
    const userId = data.session.user.id;
    if (optimizedAvatarFile) {
      try {
        const extension = optimizedAvatarFile.name.split(".").pop() || "jpg";
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
    window.location.href = "/mis-datos";
    return;
  }

  /* Si no hay sesión inmediata, guarda avatar para subir luego. */
  if (optimizedAvatarFile) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = {
          name: optimizedAvatarFile.name,
          type: optimizedAvatarFile.type,
          dataUrl: reader.result,
          savedAt: Date.now(),
        };
        window.localStorage.setItem("ab_pending_avatar", JSON.stringify(payload));
      } catch {
        // noop
      }
    };
    reader.readAsDataURL(optimizedAvatarFile);
  }

  /* Mensaje final cuando requiere confirmación por email. */
  feedback.textContent =
    "Cuenta creada. Revisá tu email para confirmar el acceso. El avatar se subirá cuando inicies sesión.";
};

/* Inicialización y hooks Astro SPA. */
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
