import assert from "node:assert/strict";
import test from "node:test";
import {
  getProductImageExtension,
  isAllowedProductImageType,
  resizeProductImage,
} from "../src/lib/imageResize.js";
import { getOwnedProductImagePath, validateOwnedProductImageUrls } from "../src/lib/productImages.js";

const context = { userId: "user-1", productId: "product-1", supabaseOrigin: "https://project.supabase.co" };
const ownedUrl = "https://project.supabase.co/storage/v1/object/public/product-images/user-1/product-1/image.webp";

test("acepta únicamente imágenes de la carpeta del producto", () => {
  assert.equal(getOwnedProductImagePath(ownedUrl, context), "user-1/product-1/image.webp");
  assert.equal(validateOwnedProductImageUrls([ownedUrl], context), true);
});

test("rechaza URLs externas o pertenecientes a otro usuario", () => {
  assert.equal(validateOwnedProductImageUrls(["https://evil.example/image.webp"], context), false);
  assert.equal(validateOwnedProductImageUrls([
    "https://project.supabase.co/storage/v1/object/public/product-images/other/product-1/image.webp",
  ], context), false);
});

test("rechaza recorridos de ruta codificados", () => {
  const traversal = "https://project.supabase.co/storage/v1/object/public/product-images/user-1/product-1/%2e%2e/other.webp";
  assert.equal(getOwnedProductImagePath(traversal, context), "");
});

test("acepta JPG y JPEG descargados de WhatsApp mediante su MIME estándar", () => {
  assert.equal(isAllowedProductImageType("image/jpeg"), true);
  assert.equal(getProductImageExtension({ name: "WhatsApp Image.jpeg", type: "image/jpeg" }), "jpg");
  assert.equal(getProductImageExtension({ name: "WhatsApp Image.jpg", type: "image/jpeg" }), "jpg");
});

test("acepta PNG y WebP y rechaza formatos fuera de la lista", () => {
  assert.equal(isAllowedProductImageType("image/png"), true);
  assert.equal(isAllowedProductImageType("image/webp"), true);
  assert.equal(isAllowedProductImageType("image/svg+xml"), false);
  assert.equal(getProductImageExtension({ name: "payload.svg", type: "image/svg+xml" }), "");
});

test("rechaza un archivo que declara MIME de imagen pero no puede decodificarse", async () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => {
    throw new Error("invalid image bytes");
  };

  try {
    await assert.rejects(
      resizeProductImage({ name: "archivo.jpeg", type: "image/jpeg" }),
      /no se pudo validar como una imagen segura/i,
    );
  } finally {
    if (originalCreateImageBitmap) globalThis.createImageBitmap = originalCreateImageBitmap;
    else delete globalThis.createImageBitmap;
  }
});
