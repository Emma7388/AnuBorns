import { supabase } from "../lib/supabaseClient";

const registerForm = document.getElementById("register-form");
const feedback = document.getElementById("register-feedback");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const passwordConfirm = document.getElementById("password-confirm");
const avatarInput = document.getElementById("avatar");
const firstName = document.getElementById("first-name");
const lastName = document.getElementById("last-name");
const phone = document.getElementById("phone");
const dni = document.getElementById("dni");
const address = document.getElementById("address");
const city = document.getElementById("city");
const province = document.getElementById("province");
const postal = document.getElementById("postal-code");

registerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!emailInput || !passwordInput || !passwordConfirm || !feedback) return;
  feedback.textContent = "Creando cuenta...";

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirm = passwordConfirm.value;
  const avatarFile = avatarInput?.files?.[0] ?? null;

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

  if (avatarFile) {
    const isImage = avatarFile.type.startsWith("image/");
    const maxSize = 2 * 1024 * 1024;
    if (!isImage) {
      feedback.textContent = "El avatar debe ser una imagen.";
      return;
    }
    if (avatarFile.size > maxSize) {
      feedback.textContent = "El avatar supera el tamaño máximo de 2MB.";
      return;
    }
  }

  const emailRedirectTo = `${window.location.origin}/mis-datos`;
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

  if (data?.session) {
    const userId = data.session.user.id;
    if (avatarFile) {
      try {
        const extension = avatarFile.name.split(".").pop() || "jpg";
        const filePath = `${userId}/avatar-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("avatar")
          .upload(filePath, avatarFile, { upsert: true, contentType: avatarFile.type });

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

  if (avatarFile) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = {
          name: avatarFile.name,
          type: avatarFile.type,
          dataUrl: reader.result,
          savedAt: Date.now(),
        };
        window.localStorage.setItem("ab_pending_avatar", JSON.stringify(payload));
      } catch {
        // noop
      }
    };
    reader.readAsDataURL(avatarFile);
  }

  feedback.textContent =
    "Cuenta creada. Revisá tu email para confirmar el acceso. El avatar se subirá cuando inicies sesión.";
});
