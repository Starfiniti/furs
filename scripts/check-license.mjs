#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPDX = 'Apache-2.0';
const APACHE_TEXT_SHA256 = 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4';

function fail(message) {
  throw new Error(`License verification failed: ${message}`);
}

async function packageManifests(parent) {
  const directory = join(repositoryRoot, parent);
  return Promise.all((await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const path = join(directory, entry.name, 'package.json');
      return { path, value: JSON.parse(await readFile(path, 'utf8')) };
    }));
}

async function main() {
  const license = (await readFile(join(repositoryRoot, 'LICENSE'), 'utf8')).replace(/^\n/u, '');
  const digest = createHash('sha256').update(license, 'utf8').digest('hex');
  if (digest !== APACHE_TEXT_SHA256) fail('LICENSE is not the canonical Apache License 2.0 text');

  const rootPackage = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
  const packages = [
    { path: join(repositoryRoot, 'package.json'), value: rootPackage },
    ...await packageManifests('apps'),
    ...await packageManifests('packages')
  ];
  for (const item of packages) {
    if (item.value.license !== SPDX) fail(`${item.path} does not declare ${SPDX}`);
  }

  const notice = await readFile(join(repositoryRoot, 'NOTICE'), 'utf8');
  if (!notice.includes('Copyright 2026 Starfiniti d.o.o.') || !notice.includes('not certified, endorsed')) {
    fail('NOTICE is missing ownership or independence language');
  }
  const thirdParty = await readFile(join(repositoryRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  for (const dependency of ['ajv', 'ajv-draft-04', 'bwip-js', 'fastify', 'node-forge', 'pg', 'qrcode']) {
    if (!thirdParty.includes(`\`${dependency}\``)) fail(`third-party inventory is missing ${dependency}`);
  }
  const dockerfile = await readFile(join(repositoryRoot, 'Dockerfile'), 'utf8');
  if (!dockerfile.includes('COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md ./') ||
      !dockerfile.includes('/app/LICENSE /app/NOTICE /app/THIRD_PARTY_NOTICES.md /app/')) {
    fail('runtime image does not preserve license and attribution files');
  }
  process.stdout.write(`${JSON.stringify({ status: 'passed', spdx: SPDX, packageManifests: packages.length, licenseSha256: digest })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'License verification failed'}\n`);
  process.exitCode = 1;
});
