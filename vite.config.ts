/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// `--mode preview` builds a self-contained copy with relative asset paths and
// hash-based routing, so it can be opened from any folder or preview host.
// The normal build (Cloudflare Pages) uses absolute paths and clean URLs.
export default defineConfig(({ mode }) => ({
  base: mode === 'preview' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    // Installable app + offline start. Disabled in the preview build (hosts that
    // do not allow service workers) and the Android app (files ship in the APK).
    VitePWA({
          disable: mode === 'preview' || mode === 'android',
          registerType: 'prompt',
          injectRegister: false,
          includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
          manifest: {
            id: '/',
            name: 'JobFlow',
            short_name: 'JobFlow',
            description: 'Production Management, Simplified. A product of RK Digitals.',
            lang: 'en-IN',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            orientation: 'any',
            theme_color: '#14213D',
            background_color: '#EEF0F3',
            categories: ['business', 'productivity'],
            icons: [
              { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
              { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            // The app's own files only. Business data never goes in this cache;
            // it lives in IndexedDB (Milestone 3). Supabase calls are not cached.
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
            navigateFallback: '/index.html',
            cleanupOutdatedCaches: true,
            maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          },
        }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    alias: {
      'virtual:pwa-register/react': new URL('./tests/mocks/pwa-register-react.ts', import.meta.url).pathname,
    },
    css: false,
  },
}));
