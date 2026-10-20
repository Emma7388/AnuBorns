/* Optimización de imágenes en navegador antes de subirlas a Storage. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const PRODUCT_IMAGE_ALLOWED_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const PRODUCT_IMAGE_EXTENSION_BY_MIME = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

export const isAllowedProductImageType = (value) =>
  PRODUCT_IMAGE_ALLOWED_MIME_TYPES.includes(String(value ?? "").trim().toLowerCase());

export const getProductImageExtension = (file) =>
  PRODUCT_IMAGE_EXTENSION_BY_MIME[String(file?.type ?? "").trim().toLowerCase()] ?? "";

/* Conserva el nombre base y fuerza la extensión del formato de salida. */
const getOutputName = (file, extension = "jpg") => {
  const name = String(file?.name ?? "image").replace(/\.[^.]+$/, "");
  return `${name}.${extension}`;
};

/* Redimensiona una imagen con canvas y devuelve un File listo para subir. */
export const resizeImageFile = async (
  file,
  {
    maxDimension = 1600,
    quality = 0.82,
    outputType = "image/jpeg",
    alwaysConvert = true,
    rejectInvalid = false,
  } = {},
) => {
  /* Si no es imagen o el navegador no puede decodificarla, se usa el archivo original. */
  if (!file?.type?.startsWith("image/")) return file;

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (rejectInvalid) throw new Error("El archivo no se pudo validar como una imagen segura.");
    return file;
  }

  const { width, height } = bitmap;
  /* Mantiene proporción y limita solo el lado más largo. */
  const maxSide = Math.max(width, height);
  const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  if (!alwaysConvert && scale === 1) {
    bitmap.close?.();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    if (rejectInvalid) throw new Error("El archivo no se pudo procesar como imagen.");
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  /* Canvas entrega Blob por callback; se envuelve en Promise para el flujo async. */
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          if (rejectInvalid) {
            reject(new Error("El archivo no se pudo convertir a una imagen segura."));
            return;
          }
          resolve(file);
          return;
        }
        const extension = outputType === "image/webp" ? "webp" : "jpg";
        resolve(new File([blob], getOutputName(file, extension), { type: outputType }));
      },
      outputType,
      quality,
    );
  });
};

/* Avatar liviano: suficiente resolución para interfaz y carga rápida. */
export const resizeAvatarImage = (file) =>
  resizeImageFile(file, {
    maxDimension: 512,
    quality: 0.85,
    outputType: "image/jpeg",
    alwaysConvert: true,
  });

/* Producto: más resolución para inspección visual, con compresión controlada. */
export const resizeProductImage = (file) =>
  resizeImageFile(file, {
    maxDimension: 1800,
    quality: 0.82,
    outputType: "image/jpeg",
    alwaysConvert: true,
    rejectInvalid: true,
  });
