/* Normalizadores compartidos para payloads de órdenes. */
export const getUniqueStringIds = (value) => [
  ...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item ?? "").trim())
      .filter(Boolean),
  ),
];
