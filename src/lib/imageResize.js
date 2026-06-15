/* Optimización de imágenes en navegador antes de subirlas a Storage. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

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
  } = {},
) => {
  /* Si no es imagen o el navegador no puede decodificarla, se usa el archivo original. */
  if (!file?.type?.startsWith("image/")) return file;

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
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
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  /* Canvas entrega Blob por callback; se envuelve en Promise para el flujo async. */
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
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
  });
