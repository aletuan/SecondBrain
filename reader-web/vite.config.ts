import { defineConfig } from 'vite';
import { vaultApiMiddleware } from './vault/apiMiddleware.js';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  appType: 'spa',
  server: {
    port: 5174,
    strictPort: false,
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
