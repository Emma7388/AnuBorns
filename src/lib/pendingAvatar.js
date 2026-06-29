/* Avatar pendiente: conserva una imagen elegida antes de confirmar/iniciar sesión. */
import { supabase } from "./supabaseClient";
import { resizeAvatarImage } from "./imageResize";

export const PENDING_AVATAR_KEY = "ab_pending_avatar";
const PENDING_AVATAR_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 2; // 48 horas
const ALLOWED_PENDING_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

let pendingAvatarPromise = null;

const clearPendingAvatar = () => {
  window.localStorage.removeItem(PENDING_AVATAR_KEY);
};

const getImageExtension = (type) => {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
};

/* Convierte un data URL guardado en localStorage a Blob para subirlo a Storage. */
const dataUrlToBlob = (dataUrl) => {
  const parts = String(dataUrl ?? "").split(",");
  const match = parts[0]?.match(/data:(.*);base64/);
  if (!match || !parts[1]) return null;
  const contentType = match[1];
  const byteString = atob(parts[1]);
  const buffer = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i += 1) {
    buffer[i] = byteString.charCodeAt(i);
  }
  return new Blob([buffer], { type: contentType });
};

/* Lee y descarta avatares pendientes vencidos o corruptos. */
const readPendingAvatar = () => {
  try {
    const raw = window.localStorage.getItem(PENDING_AVATAR_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw);
    const savedAt = Number(pending?.savedAt ?? 0);
    if (!savedAt || Date.now() - savedAt > PENDING_AVATAR_MAX_AGE_MS) {
      clearPendingAvatar();
      return null;
    }
    if (!pending?.dataUrl || !pending?.type || !ALLOWED_PENDING_AVATAR_TYPES.has(pending.type)) {
      clearPendingAvatar();
      return null;
    }
    return pending;
  } catch {
    clearPendingAvatar();
    return null;
  }
};

/* Sube el avatar pendiente una sola vez cuando ya hay sesión válida. */
export const uploadPendingAvatar = async (session, { onAvatarUrl } = {}) => {
  if (typeof window === "undefined") return { ok: true, avatarUrl: "" };
  if (pendingAvatarPromise) return pendingAvatarPromise;

  pendingAvatarPromise = (async () => {
    const pending = readPendingAvatar();
    const userId = session?.user?.id ?? "";
    if (!pending || !userId) return { ok: true, avatarUrl: "" };

    const blob = dataUrlToBlob(pending.dataUrl);
    if (!blob || !ALLOWED_PENDING_AVATAR_TYPES.has(blob.type)) {
      clearPendingAvatar();
      return { ok: false, avatarUrl: "", error: "invalid_avatar_data" };
    }

    /* Se vuelve a optimizar por seguridad antes de subir. */
    const pendingFile = new File([blob], pending.name || "avatar.jpg", { type: pending.type });
    const optimizedFile = await resizeAvatarImage(pendingFile);
    if (!ALLOWED_PENDING_AVATAR_TYPES.has(optimizedFile.type)) {
      clearPendingAvatar();
      return { ok: false, avatarUrl: "", error: "invalid_avatar_type" };
    }

    const extension = getImageExtension(optimizedFile.type);
    const filePath = `${userId}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("avatar")
      .upload(filePath, optimizedFile, { upsert: true, contentType: optimizedFile.type });

    if (uploadError) {
      return { ok: false, avatarUrl: "", error: uploadError.message };
    }

    const { data: publicData } = supabase.storage.from("avatar").getPublicUrl(filePath);
    const avatarUrl = publicData?.publicUrl ?? "";
    if (!avatarUrl) return { ok: false, avatarUrl: "", error: "missing_public_url" };

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: avatarUrl },
    });
    if (updateError) {
      return { ok: false, avatarUrl: "", error: updateError.message };
    }

    clearPendingAvatar();
    /* Señal para que otras pestañas refresquen metadata de auth. */
    window.localStorage.setItem("ab_auth_refresh", String(Date.now()));
    onAvatarUrl?.(avatarUrl);
    return { ok: true, avatarUrl };
  })();

  try {
    return await pendingAvatarPromise;
  } finally {
    pendingAvatarPromise = null;
  }
};

/* Devuelve una sesión clonada con avatar actualizado para pintar interfaz inmediata. */
export const withAvatarUrl = (session, avatarUrl) => {
  if (!session?.user || !avatarUrl) return session;
  return {
    ...session,
    user: {
      ...session.user,
      user_metadata: {
        ...(session.user.user_metadata ?? {}),
        avatar_url: avatarUrl,
      },
    },
  };
};
