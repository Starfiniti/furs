#!/usr/bin/env node

/**
 * Downloads registered official sources, computes SHA-256 digests and writes a
 * review snapshot. It intentionally does not overwrite human-approved baseline
 * hashes. A required source that cannot be retrieved fails the command.
 *
 * Usage:
 *   node scripts/check-official-sources.mjs
 *   node scripts/check-official-sources.mjs --accept-baseline --reviewer "Full Name"
 *
 * `--accept-baseline` writes current hashes and review provenance only after the
 * named human reviewer verifies the documents represented by the snapshot.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { assertExpectedContent, getDigestBytes } from './source-content.mjs';
import { evaluateSourceObservation, summarizeCheckResults } from './source-check-policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const registryPath = path.join(root, 'compliance', 'sources.json');
const snapshotPath = path.join(root, 'compliance', 'source-snapshot.generated.json');
const acceptBaseline = process.argv.includes('--accept-baseline');
const reviewerFlagIndex = process.argv.indexOf('--reviewer');
const baselineReviewer = reviewerFlagIndex >= 0 ? process.argv[reviewerFlagIndex + 1]?.trim() : null;
const baselineReviewedAt = new Date().toISOString().slice(0, 10);

if (acceptBaseline && !baselineReviewer) {
  throw new Error('--accept-baseline requires --reviewer "Full Name" after human review');
}

const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const results = [];

for (const source of registry.sources) {
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(source.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'user-agent': 'Starfiniti-FURS-Kit-Compliance-Checker/0.1'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type');
    assertExpectedContent(source, contentType, bytes);
    const digestBytes = getDigestBytes(source, bytes);
    const rawSha256 = createHash('sha256').update(bytes).digest('hex');
    const sha256 = createHash('sha256').update(digestBytes).digest('hex');
    const markerChecked = typeof source.expectedMarker === 'string';
    const markerFound = markerChecked
      ? bytes.toString('utf8').includes(source.expectedMarker)
      : null;
    const policy = evaluateSourceObservation(source, sha256, markerFound);

    if (acceptBaseline) {
      source.baselineSha256 = sha256;
      source.baselineReviewedBy = baselineReviewer;
      source.baselineReviewedAt = baselineReviewedAt;
    }

    results.push({
      id: source.id,
      authority: source.authority,
      title: source.title,
      requestedUrl: source.url,
      finalUrl: response.url,
      retrievedAt: startedAt,
      status: response.status,
      contentType,
      bytes: bytes.length,
      digestBytes: digestBytes.length,
      digestTransform: source.digestTransform ?? null,
      rawSha256,
      sha256,
      baselineSha256: policy.baselineSha256,
      baselineMatches: policy.baselineMatches,
      expectedMarker: source.expectedMarker ?? null,
      markerFound: policy.markerFound,
      reviewRequired: policy.reviewRequired,
      reviewReasons: policy.reviewReasons
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      id: source.id,
      authority: source.authority,
      title: source.title,
      requestedUrl: source.url,
      retrievedAt: startedAt,
      error: message,
      required: Boolean(source.required),
      reviewRequired: true
    });
  }
}

const { changed, failed } = summarizeCheckResults(results);

const snapshot = {
  generatedAt: new Date().toISOString(),
  registryVersion: registry.registryVersion,
  lastHumanReview: registry.lastHumanReview,
  changed,
  failed,
  results
};

await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

if (acceptBaseline) {
  registry.lastHumanReview = baselineReviewedAt;
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  console.warn(`Baseline hashes accepted by ${baselineReviewer} on ${baselineReviewedAt}.`);
}

for (const result of results) {
  if (result.error) {
    console.error(`ERROR  ${result.id}: ${result.error}`);
  } else {
    const status = result.reviewRequired ? 'REVIEW' : 'OK';
    const reasons = result.reviewReasons.length > 0
      ? ` (${result.reviewReasons.join(', ')})`
      : '';
    console.log(`${status.padEnd(6)} ${result.id} ${result.sha256}${reasons}`);
  }
}

console.log(`\nSnapshot: ${path.relative(process.cwd(), snapshotPath)}`);

if (failed) process.exit(2);
if (changed) process.exit(1);
