import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Base relativa para compatibilidade com GitHub Pages, Vercel e Netlify
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
