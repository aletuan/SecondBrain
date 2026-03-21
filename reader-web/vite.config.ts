import { defineConfig } from 'vite';
import { vaultApiMiddleware } from './vault/apiMiddleware.js';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  appType: 'spa',
  server: {
    port: 5174,
    strictPort: false,
    // Avoid stale JS/CSS in the browser when iterating on UI (private mode does not disable HTTP cache).
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  plugins: [
    {
      name: 'vault-api',
      configureServer(server) {
        server.middlewares.use(vaultApiMiddleware());
      },
    },
  ],
});
