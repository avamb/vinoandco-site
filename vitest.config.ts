import { defineConfig } from 'vitest/config';

// Unit tests: the builder (builder/test) and the browser logic of the islands
// and the platform boundary (src/**/*.test.ts). Network is always mocked; no
// test may call the live platform (checkout/start creates real holds).
export default defineConfig({
  test: {
    include: ['builder/test/**/*.test.mjs', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
