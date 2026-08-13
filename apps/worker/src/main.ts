import { hostname } from 'node:os';

import { createNodeRuntime, loadRuntimeConfig } from '@starfiniti/furs-runtime-node';

import { FiscalWorker } from './engine.js';
import { VerifiedFiscalSubmissionClient } from './submission-client.js';
import { SignedWebhookClient } from './webhook-client.js';

async function main(): Promise<void> {
  const runtime = await createNodeRuntime(loadRuntimeConfig());
  try { await runtime.refreshExternalHealth(); } catch { /* submission gate remains closed until NTP quorum succeeds */ }
  const healthTimer = setInterval(() => { void runtime.refreshExternalHealth().catch(() => undefined); }, 60_000);
  healthTimer.unref();
  const submissionClient = new VerifiedFiscalSubmissionClient({
    signer: runtime.signer,
    transport: runtime.transport,
    responseSchema: runtime.responseSchema,
    responseJws: { trustAnchors: runtime.responseTrustAnchors }
  });
  const worker = new FiscalWorker({
    repository: runtime.repository,
    submissionClient,
    ...(runtime.webhook === undefined ? {} : { webhookClient: new SignedWebhookClient(runtime.webhook) }),
    workerId: `${hostname().replace(/[^A-Za-z0-9._-]/g, '_')}:${process.pid}`,
    concurrency: runtime.config.workerConcurrency,
    assertSubmissionReady: () => {
      runtime.health.assertCertificateReady();
      runtime.health.assertClockReady();
    }
  });
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  try { await worker.run(controller.signal); }
  finally { clearInterval(healthTimer); await runtime.close(); }
}

main().catch(() => {
  process.stderr.write('Starfiniti FURS worker stopped unexpectedly; inspect protected operational logs.\n');
  process.exitCode = 1;
});
