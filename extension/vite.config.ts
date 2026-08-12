import {defineConfig, loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Main extension build: the side panel page and the MV3 service worker.
 * Both may be ES modules. The content script is built separately
 * (vite.content.config.ts) because content scripts cannot be modules.
 */
export default defineConfig(({mode}) => {
  // The backend already owns the local .env file. The Clerk publishable key is
  // safe to bundle, and reading it here avoids asking for the same value in a
  // second extension-specific file.
  const env = loadEnv(mode, resolve(here, '../server'), '');
  const clerkPublishableKey =
    env.VITE_CLERK_PUBLISHABLE_KEY || env.CLERK_PUBLISHABLE_KEY || '';

  // Where the panel borrows its session from (sidepanel/auth.ts). The same
  // origin the server already knows as PWA_ORIGIN for the pairing QR code —
  // one value, because there is only one phone app. In development that is the
  // phone app's dev server, which is on this machine.
  const pwaOrigin =
    env.PWA_ORIGIN || (mode === 'development' ? 'http://localhost:5174' : '');

  return {
    plugins: [react(), tailwind()],
    define: {
      'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(
        clerkPublishableKey,
      ),
      'import.meta.env.VITE_PWA_ORIGIN': JSON.stringify(pwaOrigin),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'esnext',
      sourcemap: false,
      rollupOptions: {
        input: {
          sidepanel: resolve(here, 'sidepanel.html'),
          background: resolve(here, 'src/background/index.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
