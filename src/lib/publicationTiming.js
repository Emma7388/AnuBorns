export const MONTHLY_RENEWAL_WINDOW_DAYS = 7;
export const MONTHLY_RENEWAL_WINDOW_MS = MONTHLY_RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const toTimestamp = (value) => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
};

export const getMonthlyPublicationTiming = ({ status, expiresAt, now = Date.now() } = {}) => {
  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const expiresAtMs = toTimestamp(expiresAt);
  const remainingMs = expiresAtMs == null ? 0 : Math.max(0, expiresAtMs - nowMs);
  const active = status === "active" && expiresAtMs != null && expiresAtMs > nowMs;
  return {
    active,
    expired: expiresAtMs != null && expiresAtMs <= nowMs,
    expiresAtMs,
    remainingMs,
    renewalAvailable: !active || remainingMs <= MONTHLY_RENEWAL_WINDOW_MS,
    renewalOpensAtMs: expiresAtMs == null ? nowMs : expiresAtMs - MONTHLY_RENEWAL_WINDOW_MS,
  };
};

export const formatPublicationRemaining = (remainingMs) => {
  const safeMs = Math.max(0, Number(remainingMs) || 0);
  const totalHours = Math.floor(safeMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const dayLabel = days === 1 ? "día" : "días";
  const hourLabel = hours === 1 ? "hora" : "horas";
  return `${days} ${dayLabel} y ${hours} ${hourLabel}`;
};
