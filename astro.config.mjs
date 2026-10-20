// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { purchaseDetailStyles } from "./src/lib/purchaseDetailStyles.js";

const require = createRequire(import.meta.url);
const astroPrerenderEntrypoint = require.resolve("astro/entrypoints/prerender");
const purchaseDetailStyleHash = `sha256-${createHash("sha256").update(purchaseDetailStyles).digest("base64")}`;

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: vercel(),
  prefetch: false,
  security: {
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "img-src 'self' data: blob: https://*.supabase.co",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
        "media-src 'self' blob: https://*.supabase.co",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "upgrade-insecure-requests",
      ],
      styleDirective: {
        resources: ["'self'", "https://fonts.googleapis.com"],
        // El detalle imprimible se crea en una ventana nueva desde una cadena CSS fija.
        hashes: [purchaseDetailStyleHash],
      },
    },
  },
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
