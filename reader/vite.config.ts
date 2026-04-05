import { defineConfig } from 'vite';
import { vaultApiMiddleware } from './vault/apiMiddleware.js';

const DEV_NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

/** Bind dev server + HMR client to the same host so WebSocket upgrades stay reliable (localhost vs 127.0.0.1 mismatches). */
const devHost = process.env.READER_DEV_HOST?.trim() || '127.0.0.1';

/**
 * File watching over Docker bind mounts / some network disks misses events; polling fixes it.
 * Set `READER_VITE_POLL=1` or `CHOKIDAR_USEPOLLING=true`.
 */
const watchPoll =
  process.env.READER_VITE_POLL === '1' ||
  process.env.READER_VITE_POLL === 'true' ||
  process.env.CHOKIDAR_USEPOLLING === 'true';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  appType: 'spa',
  clearScreen: false,
  server: {
    host: devHost,
    port: 5174,
    strictPort: false,
    hmr: {
      host: devHost,
      protocol: 'ws',
    },
    watch: {
      usePolling: watchPoll,
      interval: watchPoll ? 450 : undefined,
    },
    // Baseline for responses Vite attaches headers to (see also dev-no-cache middleware).
    headers: {
      ...DEV_NO_CACHE,
    },
  },
  plugins: [
    {
      name: 'reader-server-code-restart-hint',
      handleHotUpdate({ file, server }) {
        const f = file.replace(/\\/g, '/');
        const inVault = f.includes('/vault/') && /\.(m?[jt]s)$/.test(f);
        if (inVault) {
          server.config.logger.warn(
            '\n\x1b[33m[reader]\x1b[0m Dev API middleware lives in vault/*.ts — \x1b[1mrestart Vite\x1b[0m (Ctrl+C, then pnpm dev) for route changes to apply.\n',
          );
        }
        if (f.endsWith('vite.config.ts')) {
          server.config.logger.warn(
            '\n\x1b[33m[reader]\x1b[0m vite.config.ts changed — \x1b[1mrestart Vite\x1b[0m (Ctrl+C, then pnpm dev).\n',
          );
        }
      },
    },
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
