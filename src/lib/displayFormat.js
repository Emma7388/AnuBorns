const DEFAULT_LOCALE = "es-AR";
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const dateTimeFormatters = new Map();
const currencyFormatters = new Map();

export const cleanText = (value) => String(value ?? "").trim();

export const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getDateTimeFormatter = ({ locale, dateStyle, timeStyle }) => {
  const key = `${locale}|${dateStyle}|${timeStyle ?? ""}`;
  if (!dateTimeFormatters.has(key)) {
    dateTimeFormatters.set(key, new Intl.DateTimeFormat(locale, {
      dateStyle,
      ...(timeStyle ? { timeStyle } : {}),
    }));
  }
  return dateTimeFormatters.get(key);
};

export const formatDateTime = (
  value,
  { fallback = "-", locale = DEFAULT_LOCALE, dateStyle = "short", timeStyle = "short" } = {},
) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return getDateTimeFormatter({ locale, dateStyle, timeStyle }).format(date);
};

const normalizeCurrency = (value) => {
  const currency = cleanText(value).toUpperCase();
  return CURRENCY_CODE_PATTERN.test(currency) ? currency : "ARS";
};

const getCurrencyFormatter = ({ locale, currency, maximumFractionDigits }) => {
  const key = `${locale}|${currency}|${maximumFractionDigits}`;
  if (!currencyFormatters.has(key)) {
    currencyFormatters.set(key, new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits,
    }));
  }
  return currencyFormatters.get(key);
};

export const formatCurrency = (
  value,
  {
    currency = "ARS",
    fallback = null,
    locale = DEFAULT_LOCALE,
    maximumFractionDigits = 2,
  } = {},
) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) && fallback !== null) return fallback;
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeDigits = Math.max(0, Math.min(20, Math.trunc(Number(maximumFractionDigits) || 0)));
  return getCurrencyFormatter({
    locale,
    currency: normalizeCurrency(currency),
    maximumFractionDigits: safeDigits,
  }).format(safeAmount);
};

export const shortId = (value, { fallback = "SIN ID", length = 8 } = {}) =>
  cleanText(value).slice(0, Math.max(1, Number(length) || 8)).toUpperCase() || fallback;
