import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Unit tests: the builder (builder/test) and the browser logic of the islands
// and the platform boundary (src/**/*.test.ts). Network is always mocked; no
// test may call the live platform (checkout/start creates real holds).
// Component tests opt into jsdom with a `@vitest-environment jsdom` comment.
export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    include: ['builder/test/**/*.test.mjs', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
