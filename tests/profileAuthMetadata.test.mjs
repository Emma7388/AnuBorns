import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProfileAuthMetadata,
  mergeProfileAuthMetadata,
} from "../src/lib/profileAuthMetadata.js";

test("crea el nombre visible de Auth sin convertir el telefono en credencial", () => {
  const metadata = buildProfileAuthMetadata({
    first_name: " Ana ",
    last_name: " Molina ",
    phone: "1112345678",
  });

  assert.deepEqual(metadata, {
    first_name: "Ana",
    last_name: "Molina",
    full_name: "Ana Molina",
    display_name: "Ana Molina",
  });
  assert.equal("phone" in metadata, false);
});

test("sincroniza el nombre sin borrar metadata existente", () => {
  const metadata = mergeProfileAuthMetadata(
    { avatar_url: "https://example.com/avatar.png", locale: "es-AR" },
    { firstName: "Mauro", lastName: "Gallego" },
  );

  assert.equal(metadata.avatar_url, "https://example.com/avatar.png");
  assert.equal(metadata.locale, "es-AR");
  assert.equal(metadata.full_name, "Mauro Gallego");
  assert.equal(metadata.display_name, "Mauro Gallego");
});
