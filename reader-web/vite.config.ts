import { defineConfig } from 'vite';
import { vaultApiMiddleware } from './vault/apiMiddleware.js';

const DEV_NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

export default defineConfig({
  root: '.',
  publicDir: 'public',
  appType: 'spa',
  server: {
    port: 5174,
    strictPort: false,
    // Baseline for responses Vite attaches headers to (see also dev-no-cache middleware).
    headers: {
      ...DEV_NO_CACHE,
    },
  },
  plugins: [
    {
      name: 'reader-dev-no-cache',
      enforce: 'pre',
      configureServer(server) {
        // Apply to every dev response; `server.headers` alone can miss some internal routes.
        server.middlewares.use((_req, res, next) => {
          for (const [k, v] of Object.entries(DEV_NO_CACHE)) {
            res.setHeader(k, v);
          }
          next();
        });
      },
    },
    {
      name: 'vault-api',
      configureServer(server) {
        server.middlewares.use(vaultApiMiddleware());
      },
    },
  ],
});
