import { registerOperatorConsole } from '@starfiniti/furs-console';
import { createNodeRuntime, loadRuntimeConfig } from '@starfiniti/furs-runtime-node';

import { CoreBusinessPremiseCommandFactory, CoreFiscalCommandFactory } from './command-factory.js';
import { buildApi } from './server.js';

async function main(): Promise<void> {
  const runtime = await createNodeRuntime(loadRuntimeConfig());
  if (runtime.writeBearerToken === undefined) throw new Error('FURS API write token file is required');
  const app = buildApi({
    repository: runtime.repository,
    commandFactory: new CoreFiscalCommandFactory({ signer: runtime.signer, invoiceSchema: runtime.invoiceSchema }),
    premiseCommandFactory: new CoreBusinessPremiseCommandFactory(runtime.invoiceSchema),
    writeBearerToken: runtime.writeBearerToken,
    ...(runtime.readBearerToken === undefined ? {} : { readBearerToken: runtime.readBearerToken }),
    legalEntityId: runtime.config.legalEntityId,
    environment: runtime.config.environment,
    echo: runtime.echo,
    operationalStatus: () => runtime.health.snapshot(),
    readinessChecks: {
      certificate: async () => runtime.health.assertCertificateReady(),
      clock: async () => runtime.health.assertClockReady()
    }
  });
  registerOperatorConsole(app);
  try { await runtime.refreshExternalHealth(); } catch { /* readiness stays false until the NTP quorum succeeds */ }
  const timer = setInterval(() => { void runtime.refreshExternalHealth().catch(() => undefined); }, 60_000);
  timer.unref();
  const shutdown = async () => { clearInterval(timer); await app.close(); await runtime.close(); };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
  await app.listen({ host: runtime.config.apiHost, port: runtime.config.apiPort });
}

main().catch(() => {
  process.stderr.write('Starfiniti FURS API failed to start; inspect protected operational logs.\n');
  process.exitCode = 1;
});
