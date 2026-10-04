import assert from "node:assert/strict";
import test from "node:test";
import { categories } from "../src/data/categories.js";

test("el catálogo local conserva únicamente las diez categorías vigentes", () => {
  assert.deepEqual(
    categories.map(({ name, slug }) => ({ name, slug })),
    [
      { name: "Hogar", slug: "hogar" },
      { name: "Electrodomésticos", slug: "electrodomesticos" },
      { name: "Tecnología", slug: "tecnologia" },
      { name: "Automóviles y accesorios", slug: "automoviles-y-accesorios" },
      { name: "Moda", slug: "moda" },
      { name: "Belleza y cuidado personal", slug: "belleza-y-cuidado-personal" },
      { name: "Artículos para mascotas", slug: "articulos-para-mascotas" },
      { name: "Deportes", slug: "deportes" },
      { name: "Jardín y exteriores", slug: "jardin-y-exteriores" },
      { name: "Moda y calzado", slug: "moda-y-calzado" },
    ],
  );
});
