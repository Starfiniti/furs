import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  throw new Error(`Production layout verification failed: ${message}`);
}

async function findCorepackCli() {
  const executableDirectory = dirname(process.execPath);
  const candidates = [
    join(executableDirectory, 'node_modules', 'corepack', 'dist', 'corepack.js'),
    resolve(executableDirectory, '..', 'lib', 'node_modules', 'corepack', 'dist', 'corepack.js')
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  fail('could not locate Corepack next to the active Node.js runtime');
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function requirePath(path, description) {
  if (!(await exists(path))) fail(`missing ${description}`);
}

async function forbidPath(path, description) {
  if (await exists(path)) fail(`contains ${description}`);
}

function deploy(packageName, target, corepackCli) {
  const result = spawnSync(
    process.execPath,
    [corepackCli, 'pnpm', '--filter', packageName, 'deploy', '--prod', '--offline', target],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
      stdio: 'pipe'
    }
  );
  if (result.error !== undefined || result.status !== 0) {
    fail(`${packageName} production deployment exited with ${result.status ?? 'spawn error'}`);
  }
}

async function internalPackages(bundleRoot) {
  const scope = join(bundleRoot, 'node_modules', '@starfiniti');
  if (!(await exists(scope))) return [];
  return (await readdir(scope, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => join(scope, entry.name));
}

async function assertPackageIsReleaseOnly(packageRoot) {
  for (const forbidden of ['src', 'test', 'tsconfig.json', 'tsconfig.tsbuildinfo']) {
    await forbidPath(join(packageRoot, forbidden), `internal development artifact ${forbidden}`);
  }
}

function occurrences(text, value) {
  return text.split(value).length - 1;
}

async function verifyContainerDefinitions() {
  const baselines = JSON.parse(await readFile(join(repositoryRoot, 'deployment', 'container-images.json'), 'utf8'));
  const nodeImage = baselines?.images?.node?.reference;
  const postgresImage = baselines?.images?.postgres?.reference;
  if (typeof nodeImage !== 'string' || typeof postgresImage !== 'string') {
    fail('container image baseline manifest is incomplete');
  }
  for (const image of [nodeImage, postgresImage]) {
    if (!/@sha256:[a-f0-9]{64}$/u.test(image)) fail('container image is not pinned to a manifest digest');
  }

  const dockerfile = await readFile(join(repositoryRoot, 'Dockerfile'), 'utf8');
  const compose = await readFile(join(repositoryRoot, 'compose.yaml'), 'utf8');
  const evidenceCompose = await readFile(join(repositoryRoot, 'compose.evidence.yaml'), 'utf8');
  if (!dockerfile.includes(`ARG NODE_IMAGE=${nodeImage}`)) fail('Dockerfile does not use the reviewed Node image');
  if (/pnpm\s+prune/u.test(dockerfile)) fail('Dockerfile contains unsupported workspace pruning');
  for (const expected of [
    'pnpm --filter @starfiniti/furs-api deploy --prod --offline /release/api',
    'pnpm --filter @starfiniti/furs-worker deploy --prod --offline /release/worker',
    'pnpm --filter @starfiniti/furs-persistence-postgres deploy --prod --offline /release/persistence',
    'FROM build AS evidence',
    'CMD ["node", "/app/api/dist/main.js"]'
  ]) {
    if (!dockerfile.includes(expected)) fail(`Dockerfile is missing required release control: ${expected}`);
  }
  if (occurrences(compose, postgresImage) !== 1 || occurrences(evidenceCompose, postgresImage) !== 1) {
    fail('Compose files do not use the reviewed PostgreSQL image exactly once each');
  }
  for (const expected of [
    'command: [node, /app/persistence/dist/migrate.js]',
    'command: [node, /app/persistence/dist/provision.js]',
    'command: [node, /app/api/dist/main.js]',
    'command: [node, /app/worker/dist/main.js]'
  ]) {
    if (!compose.includes(expected)) fail(`Compose runtime command is missing: ${expected}`);
  }
  if (!evidenceCompose.includes('target: evidence') ||
      !evidenceCompose.includes('command: [node, scripts/run-postgres-evidence.mjs]')) {
    fail('PostgreSQL evidence runner is not built from the evidence image target');
  }
}

async function main() {
  await verifyContainerDefinitions();
  const corepackCli = await findCorepackCli();
  const prefix = join(tmpdir(), 'starfiniti-furs-release-');
  const releaseRoot = await mkdtemp(prefix);
  const resolvedRoot = resolve(releaseRoot);
  const resolvedPrefix = `${resolve(tmpdir())}${sep}`;
  if (!resolvedRoot.startsWith(resolvedPrefix)) fail('temporary release path escaped the OS temp directory');

  try {
    const api = join(releaseRoot, 'api');
    const worker = join(releaseRoot, 'worker');
    const persistence = join(releaseRoot, 'persistence');
    deploy('@starfiniti/furs-api', api, corepackCli);
    deploy('@starfiniti/furs-worker', worker, corepackCli);
    deploy('@starfiniti/furs-persistence-postgres', persistence, corepackCli);

    await requirePath(join(api, 'dist', 'main.js'), 'API entry point');
    await requirePath(
      join(api, 'node_modules', '@starfiniti', 'furs-console', 'public', 'index.html'),
      'operator console asset'
    );
    await requirePath(join(worker, 'dist', 'main.js'), 'worker entry point');
    await requirePath(join(persistence, 'dist', 'migrate.js'), 'migration entry point');
    await requirePath(join(persistence, 'dist', 'provision.js'), 'provisioning entry point');

    const migrationDirectory = join(persistence, 'migrations');
    const migrationFiles = (await readdir(migrationDirectory)).filter((name) => /^\d{3}_.+\.sql$/u.test(name));
    if (migrationFiles.length !== 11) fail(`expected 11 migrations, found ${migrationFiles.length}`);
    await requirePath(
      join(migrationDirectory, '011_confirmation_evidence_immutability.sql'),
      'latest digest-locked migration'
    );

    for (const bundle of [api, worker, persistence]) {
      await assertPackageIsReleaseOnly(bundle);
      for (const internalPackage of await internalPackages(bundle)) {
        await assertPackageIsReleaseOnly(internalPackage);
      }
      await forbidPath(
        join(bundle, 'node_modules', '@electric-sql', 'pglite'),
        'development-only PGlite dependency'
      );
      await forbidPath(join(bundle, 'node_modules', 'typescript'), 'TypeScript compiler');
    }

    await Promise.all([
      import(pathToFileURL(join(api, 'dist', 'index.js')).href),
      import(pathToFileURL(join(worker, 'dist', 'index.js')).href),
      import(pathToFileURL(join(persistence, 'dist', 'index.js')).href)
    ]);

    process.stdout.write(`${JSON.stringify({
      status: 'passed',
      bundles: ['api', 'worker', 'persistence'],
      migrationCount: migrationFiles.length,
      developmentArtifacts: 0
    })}\n`);
  } finally {
    await rm(releaseRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Production layout verification failed'}\n`);
  process.exitCode = 1;
});
