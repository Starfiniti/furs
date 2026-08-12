import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const { openApiDocument } = await import('../packages/service-contract/dist/index.js');
const target = fileURLToPath(new URL('../packages/service-contract/openapi.json', import.meta.url));
const generated = `${JSON.stringify(openApiDocument, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const existing = await readFile(target, 'utf8').catch(() => '');
  if (existing !== generated) {
    process.stderr.write('Generated OpenAPI document is stale. Run pnpm contract:generate.\n');
    process.exitCode = 1;
  }
} else {
  await writeFile(target, generated, 'utf8');
  process.stdout.write('Generated packages/service-contract/openapi.json.\n');
}
