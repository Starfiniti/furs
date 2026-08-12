import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { registerOperatorConsole } from '../dist/index.js';

test('FURS-SEC-002: console has strict CSP and never persists bearer tokens', async (t) => {
  const app = Fastify({ logger: false }); registerOperatorConsole(app); t.after(() => app.close()); await app.ready();
  const page = await app.inject({ method: 'GET', url: '/console' });
  const script = await app.inject({ method: 'GET', url: '/console/app.js' });
  assert.equal(page.statusCode, 200);
  assert.match(page.headers['content-security-policy'], /object-src 'none'/);
  assert.match(page.headers['cache-control'], /no-store/);
  assert.doesNotMatch(script.body, /localStorage|sessionStorage|innerHTML/);
  assert.match(script.body, /textContent/);
});
