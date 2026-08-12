import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';

const assets = new Map([
  ['/console', ['index.html', 'text/html; charset=utf-8']],
  ['/console/', ['index.html', 'text/html; charset=utf-8']],
  ['/console/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/console/styles.css', ['styles.css', 'text/css; charset=utf-8']]
] as const);

export function registerOperatorConsole(app: FastifyInstance): void {
  for (const [route, [file, type]] of assets) {
    app.get(route, async (_request, reply) => {
      const body = await readFile(new URL(`../public/${file}`, import.meta.url), 'utf8');
      return reply
        .header('cache-control', 'no-store')
        .header('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        .header('referrer-policy', 'no-referrer')
        .header('x-content-type-options', 'nosniff')
        .type(type)
        .send(body);
    });
  }
}
