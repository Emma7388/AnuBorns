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
    optimizeDeps: {
      exclude: [
        "@supabase/supabase-js",
        "astro:transitions",
        "astro:transitions/client",
        "astro/virtual-modules/transitions-router.js",
        "astro/virtual-modules/transitions-types.js",
        "astro/virtual-modules/transitions-events.js",
        "astro/virtual-modules/transitions-swap-functions.js",
      ],
    },
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
