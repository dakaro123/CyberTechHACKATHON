import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { defineConfig } from 'vite';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: dir,
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss(path.join(dir, 'tailwind.config.js')), autoprefixer()],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_URL ?? 'http://localhost:8787', changeOrigin: true },
    },
  },
  build: {
    outDir: path.join(dir, 'dist'),
    emptyOutDir: true,
  },
});
