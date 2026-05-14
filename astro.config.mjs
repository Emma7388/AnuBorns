// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const astroPrerenderEntrypoint = require.resolve("astro/entrypoints/prerender");

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: vercel(),
  prefetch: false,
  devToolbar: {
    enabled: false,
  },
  vite: {
    resolve: {
      alias: {
        "astro/entrypoints/prerender": astroPrerenderEntrypoint,
      },
    },
  },
  image: {
    // Vercel serverless adapter doesn't support Sharp; avoid the warning by disabling
    // Astro's image optimization pipeline.
    service: {
      entrypoint: "astro/assets/services/noop",
    },
  },
});
