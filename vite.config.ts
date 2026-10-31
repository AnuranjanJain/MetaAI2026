import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site under /MetaAI2026/ — the deploy workflow sets
  // VITE_PAGES_BASE. Local dev keeps '/'.
  base: process.env.VITE_PAGES_BASE ?? '/',
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
});
