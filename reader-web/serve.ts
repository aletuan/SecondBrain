/**
 * Production-style preview: serve `dist/` + same /api/* as Vite dev.
 * Run from reader-web/: `pnpm preview` (builds then starts server).
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vaultApiMiddleware } from './vault/apiMiddleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(vaultApiMiddleware());
app.use(
  express.static(path.join(__dirname, 'dist'), {
    // Local preview: always revalidate so UI changes after `pnpm build` show without hard refresh.
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store');
    },
  }),
);
const port = Number(process.env.READER_PORT ?? '4173');
app.listen(port, () => {
  console.log(`Reader web: http://127.0.0.1:${port}  (vault: env READER_VAULT_ROOT or VAULT_ROOT or ../vault)`);
});
