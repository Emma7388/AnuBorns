import { normalizeProductLocation } from "./productLocation.js";
import { normalizeDeliveryMethods } from "./shippingPreference.js";

const normalizeSellerDeliveryMethods = (value) =>
  normalizeDeliveryMethods(value).includes("envio") ? ["envio"] : ["retiro"];

const text = (value, max) => String(value ?? "").trim().slice(0, max);

export const sanitizeProductInput = (value = {}, { partial = false } = {}) => {
  const input = value && typeof value === "object" ? value : {};
  const output = {};
  const errors = [];
  const setRequiredText = (key, label, max) => {
    if (partial && !(key in input)) return;
    const normalized = text(input[key], max);
    if (!normalized) errors.push(`${label} es obligatorio.`);
    else output[key] = normalized;
  };

  setRequiredText("title", "El nombre", 120);
  setRequiredText("description", "La descripción", 2000);
  setRequiredText("category_id", "La categoría", 80);

  if (!partial || "price" in input) {
    const price = Number(input.price);
    if (!Number.isFinite(price) || price <= 0 || price > 999999999999) errors.push("El precio no es válido.");
    else output.price = Math.round(price * 100) / 100;
  }
  if (!partial || "stock" in input) {
    const stock = Number(input.stock);
    if (!Number.isInteger(stock) || stock < 1 || stock > 100) errors.push("El stock debe estar entre 1 y 100.");
    else output.stock = stock;
  }
  if (!partial || "location" in input) {
    const location = normalizeProductLocation(input.location);
    if (!location) errors.push("La ubicación es obligatoria.");
    else output.location = location;
  }
  if (!partial || "delivery_methods" in input) {
    output.delivery_methods = normalizeSellerDeliveryMethods(input.delivery_methods);
  }
  if (!partial || "pickup_address" in input || "delivery_methods" in input) {
    const deliveryMethods = output.delivery_methods ?? normalizeSellerDeliveryMethods(input.delivery_methods);
    const pickupAddress = text(input.pickup_address, 240);
    output.pickup_address = deliveryMethods.includes("retiro") ? pickupAddress || null : null;
  }
  if (!partial || "publication_type" in input) {
    const publicationType = text(input.publication_type || "permanent", 20).toLowerCase();
    if (!['permanent', 'monthly'].includes(publicationType)) errors.push("El tipo de publicación no es válido.");
    else output.publication_type = publicationType;
  }
  if ("image_url" in input) output.image_url = text(input.image_url, 2000) || null;
  if ("image_urls" in input) {
    const urls = Array.isArray(input.image_urls) ? input.image_urls.map((item) => text(item, 2000)).filter(Boolean).slice(0, 5) : [];
    output.image_urls = urls;
    if (urls.length > 0) output.image_url = urls[0];
  }
  return { ok: errors.length === 0, errors, data: output };
};
