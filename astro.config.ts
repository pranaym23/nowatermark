import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

import { SITE_URL } from './src/lib/site-url';

// NoWatermark is a static site: no adapter, no server output. Every route is
// prerendered to HTML at build time and served by Cloudflare Pages as a static
// asset. See README, "Zero-backend architecture".
export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'never',
  integrations: [react(), sitemap()],
  build: { inlineStylesheets: 'auto' },
  vite: {
    plugins: [tailwindcss()],
    build: { target: 'es2022' },
  },
});
