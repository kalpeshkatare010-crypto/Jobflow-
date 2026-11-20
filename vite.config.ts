/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json' with { type: 'json' };

// `--mode preview` builds a self-contained copy with relative asset paths and
// hash-based routing, so it can be opened from any folder or preview host.
// The normal build (Cloudflare Pages) uses absolute paths and clean URLs.
export default defineConfig(({ mode }) => ({
  base: mode === 'preview' ? './' : '/',
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
  },
}));
