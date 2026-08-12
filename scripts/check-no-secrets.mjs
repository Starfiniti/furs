import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split(/\r?\n/).filter(Boolean);
const allowedPem = /^packages\/core\/test\/fixtures\/test-[a-z-]+\.pem$/;
const binarySecret = /\.(?:p12|pfx|key)$/i;
const privateKey = /-----BEGIN (?:RSA )?PRIVATE KEY-----/;
const assignments = /(?:password|passphrase|secret|token)\s*[=:]\s*["'](?!\$)[^"'\s]{12,}["']/i;
const markerFixtures = new Set([
  'scripts/check-no-secrets.mjs',
  'packages/testkit/src/index.ts',
  'packages/testkit/test/testkit.test.mjs'
]);
const safeAssignmentFiles = new Set(['deployment/postgres/init-roles.sh']);
const failures = [];

for (const file of files) {
  const normalized = file.replaceAll('\\', '/');
  if (binarySecret.test(normalized)) failures.push(`${normalized}: secret-bearing file extension`);
  if (!/\.(?:ts|js|mjs|cjs|json|md|ya?ml|html|css|php|sh|env|example|pem)$/i.test(normalized)) continue;
  const content = await readFile(file, 'utf8').catch(() => '');
  if (privateKey.test(content) && !allowedPem.test(normalized) && !markerFixtures.has(normalized)) {
    failures.push(`${normalized}: private-key marker`);
  }
  if (assignments.test(content) && !safeAssignmentFiles.has(normalized) && !/(?:^|\/)(?:test|test-support|fixtures)(?:\/|$)/.test(normalized) && normalized !== 'scripts/check-no-secrets.mjs') {
    failures.push(`${normalized}: possible hard-coded secret`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`Secret scan failed:\n${failures.map((entry) => `- ${entry}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Secret scan passed (${files.length} repository files checked).\n`);
}
