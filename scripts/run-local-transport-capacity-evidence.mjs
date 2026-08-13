#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { Agent, createServer } from 'node:https';
import { resolve } from 'node:path';
import { createSecureContext } from 'node:tls';
import { fileURLToPath } from 'node:url';

import { postJsonWithStrictMtls, SoftwareFiscalSigner } from '../packages/core/dist/index.js';
import { fixture } from '../packages/core/test-support/crypto-helpers.mjs';

function boundedInteger(value, fallback, minimum, maximum, name) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

async function listen(server) {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local mTLS server address is unavailable');
  return new URL(`https://127.0.0.1:${address.port}/invoice`);
}

async function close(server) {
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}

export async function runLocalTransportCapacityEvidence(options = {}) {
  const totalRequests = boundedInteger(options.totalRequests, 1_000, 1, 10_000, 'totalRequests');
  const concurrency = boundedInteger(options.concurrency, 100, 1, 250, 'concurrency');
  const maximumSockets = boundedInteger(options.maximumSockets, 32, 1, 250, 'maximumSockets');
  const requiredThroughput = boundedInteger(options.requiredThroughput, 180, 1, 10_000, 'requiredThroughput');
  const ca = fixture('test-ca-cert.pem');
  const signer = SoftwareFiscalSigner.fromPem({
    privateKeyPem: fixture('test-client-key.pem'),
    certificatePem: fixture('test-client-cert.pem'),
    certificateChainPem: [ca]
  });
  const secureContext = signer.createMtlsSecureContext([ca]);
  const observations = [];
  let secureConnections = 0;
  const server = createServer({
    key: fixture('test-server-key.pem'), cert: fixture('test-server-cert.pem'), ca,
    requestCert: true, rejectUnauthorized: true, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3'
  }, (request, response) => {
    request.resume();
    request.once('end', () => {
      observations.push({
        authorized: request.socket.authorized,
        protocol: request.socket.getProtocol(),
        remotePort: request.socket.remotePort
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"InvoiceResponse":"accepted"}');
    });
  });
  server.on('secureConnection', () => { secureConnections += 1; });
  const endpoint = await listen(server);
  const agent = new Agent({
    secureContext, rejectUnauthorized: true, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3',
    keepAlive: true, keepAliveMsecs: 1_000, maxSockets: maximumSockets,
    maxTotalSockets: maximumSockets, maxFreeSockets: maximumSockets,
    maxCachedSessions: 0, scheduling: 'lifo'
  });
  const started = process.hrtime.bigint();
  try {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, totalRequests) }, async () => {
      while (next < totalRequests) {
        next += 1;
        await postJsonWithStrictMtls({ endpoint, body: '{"InvoiceRequest":"local-fixture"}', secureContext, agent });
      }
    }));
  } finally {
    agent.destroy();
    await close(server);
  }
  const elapsedMilliseconds = Number(process.hrtime.bigint() - started) / 1_000_000;
  const achievedThroughput = totalRequests / (elapsedMilliseconds / 1_000);
  const uniqueConnections = new Set(observations.map((entry) => entry.remotePort)).size;
  const strictTlsVerified = observations.length === totalRequests && observations.every(
    (entry) => entry.authorized && /^TLSv1\.[23]$/.test(entry.protocol)
  );
  const socketBoundVerified = secureConnections <= maximumSockets && uniqueConnections <= maximumSockets;
  const evidence = {
    evidenceVersion: 1,
    generatedAt: new Date().toISOString(),
    localOnly: true,
    fursEndpointContacted: false,
    fixtureCertificatesOnly: true,
    totalRequests,
    concurrency,
    maximumSockets,
    elapsedMilliseconds: Math.round(elapsedMilliseconds * 1_000) / 1_000,
    achievedThroughput: Math.round(achievedThroughput * 1_000) / 1_000,
    requiredThroughput,
    secureConnections,
    uniqueConnections,
    strictTlsVerified,
    socketBoundVerified,
    localCapacityGatePassed: strictTlsVerified && socketBoundVerified && achievedThroughput >= requiredThroughput
  };
  return Object.freeze({
    ...evidence,
    evidenceSha256: createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  });
}

async function main() {
  const evidence = await runLocalTransportCapacityEvidence({
    totalRequests: process.env.FURS_LOCAL_CAPACITY_REQUESTS,
    concurrency: process.env.FURS_LOCAL_CAPACITY_CONCURRENCY,
    maximumSockets: process.env.FURS_LOCAL_CAPACITY_MAXIMUM_SOCKETS,
    requiredThroughput: process.env.FURS_LOCAL_CAPACITY_REQUIRED_THROUGHPUT
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (!evidence.localCapacityGatePassed) process.exitCode = 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('{"code":"FURS_LOCAL_CAPACITY_FAILURE","message":"Local transport capacity evidence failed"}\n');
    process.exitCode = 1;
  });
}
