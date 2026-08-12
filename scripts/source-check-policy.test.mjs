import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateSourceObservation, summarizeCheckResults } from './source-check-policy.mjs';

const observedDigest = 'a'.repeat(64);
const reviewedBaseline = {
  baselineSha256: observedDigest,
  baselineReviewedBy: 'Human Reviewer',
  baselineReviewedAt: '2026-08-12'
};

test('a source without a pinned digest requires review', () => {
  const result = evaluateSourceObservation({ id: 'source' }, observedDigest, null);

  assert.equal(result.baselineMatches, null);
  assert.equal(result.reviewRequired, true);
  assert.deepEqual(result.reviewReasons, ['missing-baseline']);
});

test('an invalid pinned digest requires review', () => {
  const result = evaluateSourceObservation(
    { id: 'source', baselineSha256: 'not-a-sha-256' },
    observedDigest,
    null
  );

  assert.equal(result.reviewRequired, true);
  assert.deepEqual(result.reviewReasons, ['invalid-baseline']);
});

test('a changed digest requires review', () => {
  const result = evaluateSourceObservation(
    { ...reviewedBaseline, id: 'source', baselineSha256: 'b'.repeat(64) },
    observedDigest,
    null
  );

  assert.equal(result.baselineMatches, false);
  assert.deepEqual(result.reviewReasons, ['digest-changed']);
});

test('a missing expected marker requires review even when the digest matches', () => {
  const result = evaluateSourceObservation(
    { ...reviewedBaseline, id: 'source', expectedMarker: '3.2' },
    observedDigest,
    false
  );

  assert.equal(result.baselineMatches, true);
  assert.deepEqual(result.reviewReasons, ['expected-marker-missing']);
});

test('a matching digest and marker pass without review', () => {
  const result = evaluateSourceObservation(
    { ...reviewedBaseline, id: 'source', baselineSha256: observedDigest.toUpperCase(), expectedMarker: '3.2' },
    observedDigest,
    true
  );

  assert.equal(result.baselineMatches, true);
  assert.equal(result.reviewRequired, false);
  assert.deepEqual(result.reviewReasons, []);
});

test('a baseline without human review provenance requires review', () => {
  const result = evaluateSourceObservation(
    { id: 'source', baselineSha256: observedDigest },
    observedDigest,
    null
  );

  assert.deepEqual(result.reviewReasons, [
    'baseline-reviewer-missing',
    'baseline-review-date-missing'
  ]);
});

test('snapshot summary separates source review from required retrieval failures', () => {
  assert.deepEqual(
    summarizeCheckResults([
      { reviewRequired: true },
      { error: 'HTTP 503', required: true, reviewRequired: true }
    ]),
    { changed: true, failed: true }
  );
});
