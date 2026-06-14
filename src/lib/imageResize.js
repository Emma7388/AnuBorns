export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

const getOutputName = (file, extension = "jpg") => {
  const name = String(file?.name ?? "image").replace(/\.[^.]+$/, "");
  return `${name}.${extension}`;
};

export const resizeImageFile = async (
  file,
  {
    maxDimension = 1600,
    quality = 0.82,
    outputType = "image/jpeg",
    alwaysConvert = true,
  } = {},
) => {
  if (!file?.type?.startsWith("image/")) return file;

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const { width, height } = bitmap;
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

export const resizeAvatarImage = (file) =>
  resizeImageFile(file, {
    maxDimension: 512,
    quality: 0.85,
    outputType: "image/jpeg",
    alwaysConvert: true,
  });

export const resizeProductImage = (file) =>
  resizeImageFile(file, {
    maxDimension: 1800,
    quality: 0.82,
    outputType: "image/jpeg",
    alwaysConvert: true,
  });
