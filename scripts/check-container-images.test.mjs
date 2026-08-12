import assert from 'node:assert/strict';
import test from 'node:test';

import { checkContainerImageBaselines, ContainerImageBaselineError } from './check-container-images.mjs';

const digest = `sha256:${'a'.repeat(64)}`;
const updated = '2026-08-05T04:12:01.827085Z';
const baseline = {
  reviewedAt: '2026-08-12',
  images: {
    postgres: {
      reference: `postgres:17.10-bookworm@${digest}`,
      source: 'https://hub.docker.com/v2/repositories/library/postgres/tags/17.10-bookworm',
      tagLastUpdated: updated
    }
  }
};

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

test('FURS-REL-001: reviewed container image metadata matches the live tag', async () => {
  const result = await checkContainerImageBaselines(baseline, {
    fetch: async () => response({ name: '17.10-bookworm', digest, last_updated: updated })
  });
  assert.deepEqual(result, [{ name: 'postgres', reference: baseline.images.postgres.reference, status: 'current' }]);
});

test('FURS-REL-001: a repointed container tag fails closed', async () => {
  await assert.rejects(
    checkContainerImageBaselines(baseline, {
      fetch: async () => response({ name: '17.10-bookworm', digest: `sha256:${'b'.repeat(64)}`, last_updated: updated })
    }),
    (error) => error instanceof ContainerImageBaselineError && error.code === 'FURS_IMAGE_CHANGED'
  );
});

test('FURS-REL-001: source URL and remote metadata must match the reviewed reference', async () => {
  const changedSource = structuredClone(baseline);
  changedSource.images.postgres.source = 'https://example.com/v2/repositories/library/postgres/tags/17.10-bookworm';
  await assert.rejects(checkContainerImageBaselines(changedSource), /source does not match/u);
  await assert.rejects(
    checkContainerImageBaselines(baseline, {
      fetch: async () => response({ name: 'latest', digest, last_updated: updated })
    }),
    (error) => error instanceof ContainerImageBaselineError && error.code === 'FURS_IMAGE_RETRIEVAL'
  );
});
