import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

/**
 * The phone app.
 *
 * `host: true` is not a convenience here — it's the whole point. The dev server
 * has to be reachable from a phone on the same Wi-Fi, which means binding every
 * interface rather than loopback.
 */
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 5174,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
  },
});
