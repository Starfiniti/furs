#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseReleaseEvidence, validateReleaseEvidence } from './release-evidence-policy.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const configuredPath = process.env.FURS_RELEASE_EVIDENCE_MANIFEST_PATH;
  if (!configuredPath || !isAbsolute(configuredPath)) throw new Error('FURS_RELEASE_EVIDENCE_MANIFEST_PATH must be an absolute protected path');
  const manifestPath = resolve(configuredPath);
  const relativeToRepository = relative(repositoryRoot, manifestPath);
  if (relativeToRepository === '' || (!relativeToRepository.startsWith('..') && !isAbsolute(relativeToRepository))) {
    throw new Error('Release evidence manifest must remain outside the repository');
  }
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: repositoryRoot, encoding: 'utf8' });
  if (status !== '') throw new Error('Release evidence can be verified only from a clean worktree');
  const currentCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'));
  const hasLicenseFile = await access(resolve(repositoryRoot, 'LICENSE')).then(() => true, () => false);
  const manifest = parseReleaseEvidence(await readFile(manifestPath, 'utf8'));
  const result = validateReleaseEvidence(manifest, {
    currentCommitSha,
    hasLicenseFile,
    packageLicense: packageJson.license
  });
  process.stdout.write(`${JSON.stringify({ status: 'release-evidence-approved', ...result })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Release evidence verification failed'}\n`);
  process.exitCode = 1;
});
