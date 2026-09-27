const DEFAULT_SESSION_EXPIRY_SAFETY_MS = 30_000;

export const getSessionAccessToken = (session) => String(session?.access_token ?? "").trim();

export const hasUsableAccessToken = (session, { safetyMs = DEFAULT_SESSION_EXPIRY_SAFETY_MS } = {}) => {
  const token = getSessionAccessToken(session);
  if (!token) return false;

  const expiresAt = Number(session?.expires_at ?? 0);
  if (!expiresAt) return true;

  return expiresAt * 1000 - Date.now() > safetyMs;
};
