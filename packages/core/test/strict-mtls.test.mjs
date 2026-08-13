import assert from 'node:assert/strict';
import { Agent, createServer } from 'node:https';
import { createSecureContext } from 'node:tls';
import test from 'node:test';

import { FursMtlsTransport, postJsonWithStrictMtls, SoftwareFiscalSigner } from '../dist/index.js';
import { fixture } from '../test-support/crypto-helpers.mjs';

const ca = fixture('test-ca-cert.pem');
const signer = SoftwareFiscalSigner.fromPem({
  privateKeyPem: fixture('test-client-key.pem'),
  certificatePem: fixture('test-client-cert.pem'),
  certificateChainPem: [ca]
});

async function withMutualTlsServer(run, statusCode = 200, responseBody = '{"EchoResponse":"furs"}') {
  const requests = [];
  const server = createServer(
    {
      key: fixture('test-server-key.pem'),
      cert: fixture('test-server-cert.pem'),
      ca,
      requestCert: true,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3'
    },
    (request, response) => {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        requests.push({
          authorized: request.socket.authorized,
          peer: request.socket.getPeerCertificate(),
          protocol: request.socket.getProtocol(),
          body: Buffer.concat(chunks).toString('utf8'),
          remotePort: request.socket.remotePort
        });
        response.writeHead(statusCode, { 'content-type': 'application/json' });
        response.end(responseBody);
      });
    }
  );

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
    await run(new URL(`https://127.0.0.1:${address.port}/echo`), requests);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('FURS-TLS-001/002: strict two-way TLS succeeds with trusted server and client chains', async () => {
  await withMutualTlsServer(async (endpoint, requests) => {
    const response = await postJsonWithStrictMtls({
      endpoint,
      body: '{"EchoRequest":"furs"}',
      secureContext: signer.createMtlsSecureContext([ca])
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, '{"EchoResponse":"furs"}');
    assert.match(response.tlsProtocol, /^TLSv1\.[23]$/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].authorized, true);
    assert.equal(requests[0].peer.subject.CN, 'Test Fiscal Client');
    assert.equal(requests[0].body, '{"EchoRequest":"furs"}');
  });
});

test('FURS-TLS-001/002/REL-001: a bounded shared agent reuses strictly verified mTLS connections', async () => {
  await withMutualTlsServer(async (endpoint, requests) => {
    const maximumSockets = 4;
    const secureContext = signer.createMtlsSecureContext([ca]);
    const agent = new Agent({
      secureContext, rejectUnauthorized: true,
      minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3', keepAlive: true,
      maxSockets: maximumSockets, maxTotalSockets: maximumSockets,
      maxFreeSockets: maximumSockets, maxCachedSessions: 0
    });
    try {
      await Promise.all(Array.from({ length: 40 }, () => postJsonWithStrictMtls({
        endpoint, body: '{"EchoRequest":"furs"}', secureContext, agent
      })));
      assert.equal(requests.length, 40);
      assert.ok(new Set(requests.map((entry) => entry.remotePort)).size <= maximumSockets);
      assert.ok(requests.every((entry) => entry.authorized && /^TLSv1\.[23]$/.test(entry.protocol)));
    } finally {
      agent.destroy();
    }
  });
});

test('FURS-TLS-001/REL-001: transport socket concurrency is bounded', () => {
  assert.throws(() => new FursMtlsTransport({
    environment: 'test', signer, serverTrustAnchors: [ca], maximumSockets: 0
  }), /between 1 and 250/);
  assert.throws(() => new FursMtlsTransport({
    environment: 'test', signer, serverTrustAnchors: [ca], maximumSockets: 251
  }), /between 1 and 250/);
});

test('FURS-TLS-001: a missing client certificate fails the handshake', async () => {
  await withMutualTlsServer(async (endpoint, requests) => {
    const contextWithoutClientCertificate = createSecureContext({
      ca,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3'
    });
    await assert.rejects(
      postJsonWithStrictMtls({
        endpoint,
        body: '{}',
        secureContext: contextWithoutClientCertificate
      })
    );
    assert.equal(requests.length, 0);
  });
});

test('FURS-TLS-002: an untrusted server certificate fails the handshake', async () => {
  await withMutualTlsServer(async (endpoint, requests) => {
    const wrongTrust = signer.createMtlsSecureContext([fixture('test-client-cert.pem')]);
    await assert.rejects(
      postJsonWithStrictMtls({ endpoint, body: '{}', secureContext: wrongTrust }),
      /certificate|issuer|self-signed|unable/i
    );
    assert.equal(requests.length, 0);
  });
});

test('FURS-TLS-002: non-HTTPS endpoints are rejected before any request', async () => {
  assert.throws(
    () => postJsonWithStrictMtls({
      endpoint: new URL('http://127.0.0.1/'),
      body: '{}',
      secureContext: signer.createMtlsSecureContext([ca])
    }),
    /HTTPS URL/
  );
  assert.throws(
    () => postJsonWithStrictMtls({
      endpoint: new URL('https://example.test/echo?access_token=secret'),
      body: '{}',
      secureContext: signer.createMtlsSecureContext([ca])
    }),
    /credential-free HTTPS URL/
  );
});

test('FURS-TLS-002/SEC-002: oversized responses fail closed without destabilizing the process', async () => {
  await withMutualTlsServer(async (endpoint) => {
    await assert.rejects(
      postJsonWithStrictMtls({ endpoint, body: '{}', secureContext: signer.createMtlsSecureContext([ca]) }),
      (error) => error.code === 'FURS_TLS_RESPONSE_SIZE'
    );
  }, 200, 'x'.repeat(1_048_577));

  assert.throws(
    () => postJsonWithStrictMtls({
      endpoint: new URL('https://example.test/echo'),
      body: 'x'.repeat(1_048_577),
      secureContext: signer.createMtlsSecureContext([ca])
    }),
    (error) => error.code === 'FURS_TLS_REQUEST_SIZE'
  );
});

test('FURS-OUT-001: HTTP transport distinguishes retryable and client failures', async () => {
  await withMutualTlsServer(async (endpoint) => {
    await assert.rejects(
      postJsonWithStrictMtls({ endpoint, body: '{}', secureContext: signer.createMtlsSecureContext([ca]) }),
      (error) => error.code === 'FURS_TLS_HTTP_RETRYABLE'
    );
  }, 503);
  await withMutualTlsServer(async (endpoint) => {
    await assert.rejects(
      postJsonWithStrictMtls({ endpoint, body: '{}', secureContext: signer.createMtlsSecureContext([ca]) }),
      (error) => error.code === 'FURS_TLS_HTTP_CLIENT'
    );
  }, 400);
});
