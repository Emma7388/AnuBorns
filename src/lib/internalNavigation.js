/* Utilidades compartidas para conservar el origen al navegar dentro de la app. */
const MAX_INTERNAL_PATH_LENGTH = 2048;

export const isSafeInternalPath = (value) => {
  const path = String(value ?? "").trim();
  return Boolean(
    path &&
      path.length <= MAX_INTERNAL_PATH_LENGTH &&
      path.startsWith("/") &&
      !path.startsWith("//") &&
      !path.includes("://") &&
      !/[\r\n]/.test(path),
  );
};

export const getCurrentInternalPath = (url) => {
  const pathname = String(url?.pathname ?? "");
  const search = String(url?.search ?? "");
  const path = `${pathname}${search}`;
  return isSafeInternalPath(path) ? path : "/";
};

export const withReturnPath = (destination, fromPath) => {
  const safeDestination = String(destination ?? "").trim();
  if (!isSafeInternalPath(safeDestination) || !isSafeInternalPath(fromPath)) return safeDestination || "#";
  const separator = safeDestination.includes("?") ? "&" : "?";
  return `${safeDestination}${separator}from=${encodeURIComponent(fromPath)}`;
};
