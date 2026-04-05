// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  image: {
    // Vercel serverless adapter doesn't support Sharp; avoid the warning by disabling
    // Astro's image optimization pipeline.
    service: {
      entrypoint: 'astro/assets/services/noop',
    },
  },
});
