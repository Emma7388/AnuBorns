const getStorageArea = (kind) => {
  if (typeof window === "undefined") return null;
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

export const readStorageValue = (key, { kind = "local", fallback = null } = {}) => {
  const storage = getStorageArea(kind);
  if (!storage || !key) return fallback;
  try {
    return storage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

export const writeStorageValue = (key, value, { kind = "local" } = {}) => {
  const storage = getStorageArea(kind);
  if (!storage || !key) return false;
  try {
    storage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
};

export const removeStorageValue = (key, { kind = "local" } = {}) => {
  const storage = getStorageArea(kind);
  if (!storage || !key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

export const readStorageJson = (key, { kind = "local", fallback = null } = {}) => {
  const raw = readStorageValue(key, { kind });
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const writeStorageJson = (key, value, { kind = "local" } = {}) => {
  try {
    return writeStorageValue(key, JSON.stringify(value), { kind });
  } catch {
    return false;
  }
};
