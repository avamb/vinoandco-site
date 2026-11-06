// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import { siteUrl } from './site.config.ts';

// Static only: `dist/` is plain files served by nginx (docker-compose.yml).
// Addresses keep the WordPress shape: trailing slash, one folder per page.
// Everything Astro emits (CSS, JS) goes under /_site/ (spec 62 §4.1).
export default defineConfig({
  site: siteUrl,
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    assets: '_site/assets',
    // No inline CSS: the Content Security Policy allows styles from 'self' only.
    inlineStylesheets: 'never',
  },
  vite: {
    // No inline scripts either (CSP); the few Astro adds are hashed by scripts/postbuild.mjs.
    build: { assetsInlineLimit: 0 },
  },
  integrations: [svelte()],
  devToolbar: { enabled: false },
});
