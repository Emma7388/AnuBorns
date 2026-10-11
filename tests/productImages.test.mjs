import assert from "node:assert/strict";
import test from "node:test";
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
