// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import { createHash } from "node:crypto";
import { purchaseDetailStyles } from "./src/lib/purchaseDetailStyles.js";

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
        resources: [
          { resource: "'self'", kind: "element" },
          { resource: "https://fonts.googleapis.com", kind: "element" },
          // La interfaz calcula posiciones y colores mediante atributos style.
          // La excepción no habilita bloques <style> ni scripts inline.
          { resource: "'unsafe-inline'", kind: "attribute" },
        ],
        // El detalle imprimible se crea en una ventana nueva desde una cadena CSS fija.
        hashes: [{ hash: purchaseDetailStyleHash, kind: "element" }],
      },
    },
  },
  markdown: {
    // Prism evita los atributos inline generados por Shiki y mantiene la CSP estricta.
    syntaxHighlight: "prism",
  },
  devToolbar: {
    enabled: false,
  },
  vite: {
    optimizeDeps: {
      exclude: ["@supabase/supabase-js"],
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
