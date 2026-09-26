export const ADMIN_PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "dni",
  "address",
  "city",
  "province",
  "postal_code",
];

const PROFILE_TEXT_MAX = {
  name: 60,
  phone: 15,
  dni: 8,
  address: 120,
  place: 80,
  postal: 10,
  reason: 240,
};

const normalizeWhitespace = (value, maxLength) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const normalizePersonName = (value) =>
  normalizeWhitespace(value, PROFILE_TEXT_MAX.name)
    .replace(/[^\p{L}\p{M}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeAddress = (value) =>
  normalizeWhitespace(value, PROFILE_TEXT_MAX.address)
    .replace(/[<>]/g, "")
    .trim();

const normalizePlace = (value) =>
  normalizeWhitespace(value, PROFILE_TEXT_MAX.place)
    .replace(/[^\p{L}\p{M}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeDigits = (value, maxLength) =>
  String(value ?? "").replace(/\D/g, "").slice(0, maxLength);

const normalizePostalCode = (value) =>
  normalizeWhitespace(value, PROFILE_TEXT_MAX.postal)
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .toUpperCase()
    .trim();

export const normalizeAdminProfileInput = (values = {}) => ({
  first_name: normalizePersonName(values.first_name ?? values.firstName),
  last_name: normalizePersonName(values.last_name ?? values.lastName),
  phone: normalizeDigits(values.phone, PROFILE_TEXT_MAX.phone),
  dni: normalizeDigits(values.dni, PROFILE_TEXT_MAX.dni),
  address: normalizeAddress(values.address),
  city: normalizePlace(values.city),
  province: normalizePlace(values.province),
  postal_code: normalizePostalCode(values.postal_code ?? values.postalCode),
});

export const normalizeAdminReason = (value) => normalizeWhitespace(value, PROFILE_TEXT_MAX.reason);

export const validateAdminProfileInput = (values = {}) => {
  const profile = normalizeAdminProfileInput(values);
  const errors = [];

  if (profile.first_name.length < 2) errors.push("Ingresá un nombre válido.");
  if (profile.last_name.length < 2) errors.push("Ingresá un apellido válido.");
  if (profile.phone.length < 8) errors.push("Ingresá un teléfono válido, solo números.");
  if (profile.dni.length < 7 || profile.dni.length > 8) errors.push("Ingresá un DNI válido, solo números.");
  if (profile.address.length < 4) errors.push("Ingresá una dirección más completa.");
  if (profile.city.length < 2) errors.push("Ingresá una ciudad válida.");
  if (profile.province.length < 2) errors.push("Ingresá una provincia válida.");
  if (profile.postal_code.length < 4) errors.push("Ingresá un código postal válido.");

  return { ok: errors.length === 0, profile, errors };
};

export const buildProfileDiff = (before = {}, after = {}) =>
  ADMIN_PROFILE_FIELDS.reduce((diff, field) => {
    const previous = String(before?.[field] ?? "").trim();
    const next = String(after?.[field] ?? "").trim();
    if (previous !== next) {
      diff[field] = { before: previous, after: next };
    }
    return diff;
  }, {});
