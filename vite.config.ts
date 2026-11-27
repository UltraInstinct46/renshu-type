import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite's static middleware adds `Content-Encoding: gzip` to `.gz` files, which
 * makes the browser auto-decompress them before kuromoji's own Gunzip runs.
 * Serve `/dict/*.dat.gz` as raw `application/gzip` (matching GitHub Pages).
 */
function rawDictMiddleware(root: string, base: string) {
  const prefix = `${base}dict/`;
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url?.split('?')[0];
    if (!url || !url.startsWith(prefix) || !url.endsWith('.dat.gz')) return next();
    const file = path.join(root, 'public', 'dict', path.basename(url));
    if (!fs.existsSync(file)) return next();
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Length', fs.statSync(file).size);
    fs.createReadStream(file).pipe(res);
  };
}

export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/renshu-type/' : '/';
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'serve-raw-kuromoji-dict',
        configureServer(server) {
          server.middlewares.use(rawDictMiddleware(server.config.root, base));
        },
        configurePreviewServer(server) {
          server.middlewares.use(rawDictMiddleware(server.config.root, base));
        },
      },
    ],
  };
});
