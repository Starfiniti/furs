# Self-hosted deployment

## Security boundary

Run one legal entity per deployment. Bind the API to loopback or a private
network behind an authenticated reverse proxy. Do not place the fiscal service,
PostgreSQL, metrics, or operator console on the public internet.

Create protected files outside the repository for:

1. FURS `.p12` certificate (read-only);
2. certificate passphrase;
3. distinct API read and fiscalize/write tokens with at least 32 random characters;
4. database-owner password;
5. separate API and worker database passwords;
6. reviewed FURS server and signed-response CA certificates.

Select at least two independently operated NTP servers that are reachable over
UDP/123 from both API and worker containers. Record the reviewed list in
`FURS_NTP_SERVERS_JSON`; the runtime requires a quorum of two by default.
`FURS_API_MAXIMUM_REQUESTS_PER_MINUTE` defaults to `600` and is enforced per
bearer credential. Set it explicitly from the reviewed peak, polling behavior
and reverse-proxy controls; accepted values are `10` through `100000`. A load
test may use a higher protected test-only value, but production still requires
edge rate limits, authentication and capacity evidence for the selected value.
`FURS_WORKER_CONCURRENCY` defaults to `1` and allows `1` through `100`
simultaneous leased deliveries in one worker process. Raise it only from measured
FURS latency, database-pool capacity and an approved load target. PostgreSQL
leases and immutable identities remain authoritative at every setting.

Plain SNTP is not cryptographically authenticated, so production should prefer
controlled infrastructure sources and restrict UDP/123 to the reviewed list.
Record whether the deployment threat model requires authenticated NTS.

Copy `templates/compliance-source-review.example.json` to a protected deployment
configuration path, replace the reviewer placeholder after an actual human
review, and mount it through `FURS_COMPLIANCE_SOURCE_MANIFEST_FILE`. The example
deliberately omits the changed SPOT online-retail source: do not add its new
digest until the pending accounting/tax review is recorded. Provisioning writes
the accepted source digests to an append-only database ledger.

Also mount the exact reviewed official JSON schema and set its registered
SHA-256 digest. The runtime refuses changed schema bytes.

## Docker Compose

Set the host paths required by `compose.yaml`:

```text
FURS_CERTIFICATE_FILE
FURS_CERTIFICATE_PASSPHRASE_FILE
FURS_API_READ_TOKEN_FILE
FURS_API_WRITE_TOKEN_FILE
FURS_OWNER_DB_PASSWORD_FILE
FURS_API_DB_PASSWORD_FILE
FURS_WORKER_DB_PASSWORD_FILE
FURS_SCHEMA_FILE
FURS_SERVER_CA_FILE
FURS_RESPONSE_CA_FILE
FURS_INVOICE_SCHEMA_SHA256
FURS_RESPONSE_SCHEMA_SHA256
FURS_NTP_SERVERS_JSON
FURS_LEGAL_ENTITY_ID
FURS_LEGAL_ENTITY_NAME
FURS_LEGAL_ENTITY_TAX_NUMBER_FILE
FURS_WEBHOOK_DESTINATION_ID
FURS_WEBHOOK_URL
FURS_WEBHOOK_SECRET_FILE
```

Start in the test environment:

```bash
docker compose config
docker compose up --build
```

The Node and PostgreSQL base images are pinned to reviewed multi-platform
manifest digests recorded in `deployment/container-images.json`. Update the tag,
digest, retrieval metadata and vulnerability evidence together; do not remove
the digest to obtain a newer image implicitly. `corepack pnpm container:check`
fails when a reviewed Docker Hub tag is repointed, and CI runs it alongside the
official-source check. The final service image contains
three production-only bundles (API, worker and migration/provisioning) and no
package manager, TypeScript compiler, PGlite, repository tests or source tree.
The reviewed Alpine runtime reduces the operating-system package surface while
the vulnerability gate continues to reject every known high or critical finding.
The separate
Docker `evidence` target retains the versioned evidence runner only for the
isolated `compose.evidence.yaml` workflow.

The migration container runs as the database owner. API and worker processes
use different least-privilege login roles. Containers are read-only, drop Linux
capabilities, and mount restricted material read-only. The API is published only
on `127.0.0.1` by default.

## Health and metrics

- `/health/live`: process liveness only.
- `/health/ready`: PostgreSQL, certificate validity and a recent quorum-backed SNTP clock observation.
- `/metrics`: authenticated Prometheus output with redacted counts and ages.
- `/console`: public static shell; all data calls still require a token.

The read credential may only call `GET`/`HEAD` routes. Fiscal submission,
premise/device configuration, retries, reconciliation and FURS echo require the
write credential. The API also enforces a bounded per-credential request rate;
an edge proxy should add IP/network-level limiting and SSO/MFA for operators.

When the three webhook settings are present, every terminal confirmation,
rejection or manual-review transition atomically creates a redacted delivery.
The worker verifies the stored payload hash and signs `timestamp.payload` with
HMAC-SHA256 in `X-Starfiniti-Webhook-Signature`. Webhooks use bounded retries
and a durable dead-letter state; production destinations must use HTTPS.

The worker writes a database heartbeat every ten seconds. Metrics expose only
its age, and the supplied Prometheus rules alert when no worker is visible for
more than 30 seconds.

The worker applies the same certificate and fresh-clock gate before every FURS
submission. Missing, stale, excessive-drift, unsynchronized, uncorrelated or
out-of-bound NTP observations fail closed and use the bounded retry path without
opening a connection to FURS. Webhook delivery does not depend on this fiscal
submission gate.

Import `deployment/prometheus-alerts.yml` and route critical alerts to a named
operator. Keep the metric endpoint private because operational counts are internal.

## Certificate arrival

Verify the sender and fingerprint through the official channel. Store the test
certificate at `C:\Users\dejan\AppData\Local\Starfiniti\FURS\certificates\test`
on the current Windows workstation, never in this repository or Nextcloud.
Record only certificate metadata/fingerprint in operational evidence.

## Production transition

Production uses a separate certificate, secret paths, database and environment.
Do not reuse test material. The environment is an allowlisted `test|production`
choice; custom FURS endpoints and disabled TLS checks are intentionally unsupported.
