import { defineConfig } from 'vite';

// base relativa: il sito funziona sia su https://<utente>.github.io/<repo>/ sia in locale.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
