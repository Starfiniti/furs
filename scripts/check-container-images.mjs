#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const REFERENCE = /^(?<image>[a-z0-9][a-z0-9._/-]*):(?<tag>[A-Za-z0-9][A-Za-z0-9._-]*)@(?<digest>sha256:[a-f0-9]{64})$/u;
const MAX_RESPONSE_CHARACTERS = 1_048_576;

export class ContainerImageBaselineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContainerImageBaselineError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new ContainerImageBaselineError(code, message);
}

function parseEntry(name, value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('FURS_IMAGE_BASELINE', `Container image ${name} baseline is invalid`);
  }
  const match = typeof value.reference === 'string' ? REFERENCE.exec(value.reference) : null;
  if (match?.groups === undefined || typeof value.source !== 'string' || typeof value.tagLastUpdated !== 'string') {
    reject('FURS_IMAGE_BASELINE', `Container image ${name} baseline is incomplete`);
  }
  let source;
  try { source = new URL(value.source); } catch { reject('FURS_IMAGE_SOURCE', `Container image ${name} source URL is invalid`); }
  const expectedPath = `/v2/repositories/library/${match.groups.image}/tags/${match.groups.tag}`;
  if (
    source.protocol !== 'https:' || source.hostname !== 'hub.docker.com' || source.pathname !== expectedPath ||
    source.username || source.password || source.search || source.hash
  ) {
    reject('FURS_IMAGE_SOURCE', `Container image ${name} source does not match its reference`);
  }
  if (Number.isNaN(Date.parse(value.tagLastUpdated))) {
    reject('FURS_IMAGE_BASELINE', `Container image ${name} update timestamp is invalid`);
  }
  return { name, reference: value.reference, digest: match.groups.digest, tag: match.groups.tag, source, tagLastUpdated: value.tagLastUpdated };
}

export async function checkContainerImageBaselines(value, options = {}) {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || typeof value.images !== 'object' || value.images === null) {
    reject('FURS_IMAGE_BASELINE', 'Container image baseline manifest is invalid');
  }
  const entries = Object.entries(value.images).map(([name, entry]) => parseEntry(name, entry));
  if (entries.length === 0) reject('FURS_IMAGE_BASELINE', 'Container image baseline manifest is empty');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const results = [];
  for (const entry of entries) {
    const response = await fetchImpl(entry.source, { redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 20_000) });
    if (!response.ok) reject('FURS_IMAGE_RETRIEVAL', `Container image ${entry.name} metadata returned HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) reject('FURS_IMAGE_RETRIEVAL', `Container image ${entry.name} metadata is too large`);
    let remote;
    try { remote = JSON.parse(text); } catch { reject('FURS_IMAGE_RETRIEVAL', `Container image ${entry.name} metadata is invalid JSON`); }
    if (
      typeof remote !== 'object' || remote === null || Array.isArray(remote) || remote.name !== entry.tag ||
      typeof remote.digest !== 'string' || !DIGEST.test(remote.digest) || typeof remote.last_updated !== 'string'
    ) {
      reject('FURS_IMAGE_RETRIEVAL', `Container image ${entry.name} metadata has an invalid shape`);
    }
    if (remote.digest !== entry.digest || remote.last_updated !== entry.tagLastUpdated) {
      reject('FURS_IMAGE_CHANGED', `Container image ${entry.name} tag changed and requires reviewed baseline and vulnerability evidence`);
    }
    results.push(Object.freeze({ name: entry.name, reference: entry.reference, status: 'current' }));
  }
  return Object.freeze(results);
}

async function main() {
  const path = resolve(repositoryRoot, 'deployment', 'container-images.json');
  const baseline = JSON.parse(await readFile(path, 'utf8'));
  const results = await checkContainerImageBaselines(baseline);
  process.stdout.write(`${JSON.stringify({ status: 'passed', images: results })}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const safe = error instanceof ContainerImageBaselineError
      ? { code: error.code, message: error.message }
      : { code: 'FURS_IMAGE_FAILURE', message: 'Container image baseline check failed' };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
