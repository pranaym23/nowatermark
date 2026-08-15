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
  /*
   * Astro emits small inline module scripts to hydrate islands. A hand-written
   * `script-src 'self'` in public/_headers blocked them in production and the
   * scanner never booted — a bug invisible locally, because `astro preview`
   * does not apply _headers. Letting Astro own the policy means it hashes its
   * own inline scripts on every build instead of us maintaining hashes by hand.
   *
   * style-src needs 'unsafe-inline' because the React components style through
   * the `style` attribute, which CSP treats as inline.
   *
   * frame-ancestors cannot be set from a meta tag, so X-Frame-Options in
   * public/_headers still covers framing.
   */
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob: https://*.google-analytics.com https://www.googletagmanager.com",
        "font-src 'self'",
        // Cloudflare Pages injects the Web Analytics beacon into the HTML
        // response, so the CSP has to admit it or analytics silently collects
        // nothing. The beacon posts its RUM payload to cloudflareinsights.com.
        // It carries page-level data only - never anything derived from a
        // user's file, which is processed entirely on-device.
        // `connect-src 'self'` also covers /api/rewrite: the text-rewrite proxy
        // is same-origin precisely so this directive does not have to name an
        // external API. challenges.cloudflare.com is Turnstile, which guards it.
        "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
        "worker-src 'self' blob:",
        // Turnstile renders its challenge inside an iframe.
        "frame-src https://challenges.cloudflare.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ],
      /*
       * 'unsafe-inline' is ignored by the browser whenever a hash is also
       * present in the same source list, so putting it in style-src does
       * nothing and the React `style` attributes get blocked. Declaring it as
       * an `attribute` resource emits a separate `style-src-attr`, which
       * hashes do not apply to — that is the directive style attributes are
       * actually checked against.
       */
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
      scriptDirective: {
        resources: [
          "'self'",
          'https://static.cloudflareinsights.com',
          'https://www.googletagmanager.com',
          // Turnstile's api.js, loaded on demand by the text-rewrite panel.
          'https://challenges.cloudflare.com',
        ],
      },
    },
  },
  // format 'file' emits /exif-remover.html rather than /exif-remover/index.html.
  // Cloudflare Pages then serves /exif-remover directly instead of 308-ing to
  // /exif-remover/, which would contradict our no-trailing-slash canonicals.
  build: { inlineStylesheets: 'auto', format: 'file' },
  vite: {
    plugins: [tailwindcss()],
    build: { target: 'es2022' },
  },
});
