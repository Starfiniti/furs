# Internal certificate, authentication and cryptography review – 13 August 2026

## Scope and independence boundary

Requirements: `FURS-SEC-001`, `FURS-SEC-002`, `FURS-TLS-001`,
`FURS-TLS-002`, `FURS-JWS-001`, `FURS-JWS-002`, `FURS-OUT-001` and
`FURS-AUD-001`. The reviewed source baseline was FURS technical documentation
3.2 and the unchanged official JSON schema retrieved on 13 August 2026.

This is an internal engineering review of the current implementation and local
test deployment. It is not the required independent security review and cannot
approve production.

Reviewed boundaries:

- PKCS#12 parsing, key/certificate matching, certificate validity and in-memory
  signer construction;
- strict mutual TLS endpoints, server trust, request/response bounds and network
  failure classification;
- outbound RS256 construction and inbound JWS signature/chain validation;
- API bearer-token comparison, read/write scopes, request limits and error
  redaction;
- mounted secret files, process command lines, repository contents and Windows
  access-control entries;
- signed result webhooks, payload hashes, replay windows and adapter HMAC entry
  points;
- container user/capability/read-only settings and dependency/image CI gates.

## Findings corrected

### ISR-001 — interrupted or oversized TLS response handling

The response-size branch destroyed the response stream without an explicit
`error`/`aborted` settlement handler. A large or interrupted peer response could
therefore destabilize the worker instead of producing a bounded fail-closed
outcome.

The transport now:

- rejects request and response bodies over 1 MiB;
- settles response `error` and `aborted` events exactly once;
- returns `FURS_TLS_RESPONSE_SIZE` for an oversized response;
- classifies `FURS_TLS_RESPONSE_ABORTED` as a temporary connection failure so
  bounded retry preserves the original document, sequence, issue time and ZOI;
- treats the bounded set of ordinary DNS, refused/reset connection, unreachable
  network/host, broken-pipe and timeout codes as temporary connectivity failures.

A local strict-mTLS server regression test sends a response over the limit and
proves rejection without process failure.

### ISR-002 — secret-bearing query strings

The low-level mTLS endpoint validator and runtime webhook validator rejected URL
credentials and fragments but did not reject query strings. Both now reject a
query before any request, preventing access tokens or other secrets from being
embedded in those configured URLs.

### ISR-003 — unsupported JWS critical semantics

The verifier required RS256, a trusted valid `x5c` chain and a valid signature,
but did not explicitly reject unsupported JWS `crit` semantics or `b64:false`.
It now fails closed on any unsupported critical-header declaration and on
non-Base64URL payload semantics. Signed negative regression vectors cover both.

## Official FURS regression after correction

The local test worker was cleanly restarted from the corrected build. Its fresh
heartbeat was 0.537 seconds old, clock drift was -990 milliseconds, the outbox
was empty and API readiness returned HTTP 200.

A new synthetic foreign-operator invoice then reached `CONFIRMED` in the
official FURS test environment as document
`130aec13-3ffa-44b4-8e33-8362110cd765`. This proves that the stricter JWS
semantics accept the current real FURS response path rather than only local
fixtures. The scenario SHA-256 is
`f1aff351605f5d462023674280cf32dcd6f7475b86af91ad3cc9e5cf95a4ab41`,
the redacted evidence SHA-256 is
`561ac22ee331b2e15e898385bb7ec5bd2e5e8bdf2db6405f5c617878c22fa69b`,
and the complete protected JSON file SHA-256 is
`3f442ef98d3d15c453f6b1a9ce61feea4babef14bc14e8716b466a3bde1c390e`.

The active 48-hour soak also completed its third cycle after the worker restart,
preserving its existing evidence-chain progression.

## Controls verified without a finding

- API tokens are hashed and compared with `timingSafeEqual`; read and write
  credentials are distinct, scoped and rate limited.
- Health endpoints expose only readiness category names. Metrics and fiscal data
  endpoints require authentication; the public console is a static shell and
  does not persist a token.
- PKCS#12 bytes and the temporary parsing copy are zeroed after signer creation.
  The private key matches the selected valid RSA certificate before use.
- FURS endpoints are environment-allowlisted and strict TLS validation cannot be
  disabled. Server and signed-response trust anchors are separate inputs.
- Raw signed FURS responses, private keys, passwords and P12 material have no
  PostgreSQL columns and are not tracked by Git.
- The live API, worker and soak process command lines contain no secret values.
- The current protected P12, API token and worker database-password files grant
  effective access only to the workstation user and `SYSTEM`; none is in the
  repository or Nextcloud workspace.
- Runtime containers use a non-root user, read-only filesystem, dropped Linux
  capabilities, `no-new-privileges`, read-only secret mounts and loopback host
  publication for the API.
- `corepack pnpm audit --prod --audit-level=high` reports no known
  vulnerabilities. Repository secret scanning passes.

## Residual production boundaries

The software signer necessarily retains an exportable private-key representation
inside the process for mTLS. Production should prefer the documented
HSM/PKCS#11 or Vault/OpenBao signer boundary; otherwise host hardening, encrypted
storage, dump/swap policy and secret rotation require independent acceptance.

Production also still requires a private authenticated reverse proxy with
SSO/MFA, egress policy, controlled time sources, named alert receiver/escalation,
second-certificate rotation, production backup/PITR evidence and an independent
reviewer. No internal result in this report closes those gates.

## Reproducible verification

- `corepack pnpm check`: 162 passed, 0 failed, 0 skipped, 0 todo.
- `corepack pnpm audit --prod --audit-level=high`: no known vulnerabilities.
- `node scripts/check-no-secrets.mjs`: passed.
- GitHub `test` and `container-security`: required to be green on the resulting
  pull-request commit.
