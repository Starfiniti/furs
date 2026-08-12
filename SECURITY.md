# Security model

## Reporting a vulnerability

Use GitHub's private vulnerability-reporting form for this repository. Do not
open a public issue or include certificates, credentials, invoice data, tax
numbers, signed tokens, or exploit details in a public channel. Include affected
commit/version, impact, reproduction steps using synthetic data, and a safe
contact method. Starfiniti d.o.o. will acknowledge and triage the report through
the private advisory.

## Protected assets

Highest-sensitivity assets:

- FURS client private key and P12/PEM material;
- certificate password/passphrase;
- signer/HSM/Vault credentials;
- raw signed requests and responses;
- personal operator tax numbers;
- invoice/customer details;
- service authentication keys;
- database credentials and backups.

## Data classification

| Class | Examples | Minimum handling |
|---|---|---|
| Restricted | Private keys, P12/PEM material, certificate passwords, signer credentials, database credentials, raw signed requests/responses | Never commit or log. Encrypt at rest and in transit, restrict access to the signer/service identity, and preserve only in approved secret or incident storage. |
| Confidential fiscal/personal | Full invoices, customer details, operator tax numbers, taxpayer numbers, correction links, audit evidence containing business data | Minimize collection and retention, encrypt at rest and in transit, enforce least privilege, redact logs, and audit access. |
| Internal operational | Internal document UUIDs, state transitions, retry counts, latency, redacted hashes, certificate fingerprint suffixes | Keep within authenticated operational systems and apply retention limits. |
| Public | Published schemas' URLs and hashes, architecture documents, package API documentation, redacted test vectors | May be committed and published after source, licensing, and privacy review. |

Classification follows the most sensitive field in a record. Hashing or encoding does not automatically lower a classification.

## Trust boundaries

- Upstream adapters are untrusted command sources until authenticated, authorized, schema-validated, and idempotency-checked.
- The API and worker may handle confidential fiscal data but must not gain unrestricted access to exportable signing secrets when an external signer is available.
- The signer/secret provider is a restricted boundary with a minimal signing and mTLS interface.
- PostgreSQL is authoritative for identity, workflow, and audit state but is not approved plaintext key storage.
- FURS endpoints are external systems; both strict TLS and signed-response verification are required.
- Logs, metrics, traces, CI artifacts, support systems, and AI prompts are outside the restricted-secret boundary.

## Threats

- theft or misuse of the fiscal-signing certificate;
- forged/tampered FURS response accepted as valid;
- man-in-the-middle attack after TLS validation is disabled or pinned incorrectly;
- duplicate fiscal invoices from retries/webhook replay;
- sequence reuse through concurrency or restore;
- undetected pending invoices during an outage;
- logs/telemetry leaking certificate or personal data;
- one tenant accessing another tenant's signer or documents;
- compromised adapter/plugin issuing arbitrary fiscal documents;
- source/specification changes silently invalidating behavior;
- clock/timezone errors producing a wrong ZOI;
- database restore rolling counters backward.

## Secret handling

### Local development

- Use only a FURS test certificate.
- Mount the P12 read-only outside source control.
- Load password from a local secret store or protected environment variable.
- Never put certificate bytes/passwords in `.env.example`, fixtures, screenshots, tickets, or AI prompts.

### Self-hosted production

Preferred order:

1. HSM/PKCS#11 or non-exportable signer.
2. OpenBao/Vault-backed signer or envelope-encrypted secret with tightly scoped identity.
3. Read-only encrypted P12 mounted into a dedicated service container with strict filesystem permissions.

Do not store the P12 directly in WordPress options, Shopify metadata, Supabase public storage, ordinary S3 buckets, or plain PostgreSQL columns.

## Network

- Place service on a private network.
- Expose the API only to authenticated internal integrations.
- Restrict outbound traffic to required FURS endpoints and operational dependencies where feasible.
- Use strict TLS validation and current supported protocol/cipher configuration.
- Add rate limits and request-size limits.
- Do not allow user-configurable arbitrary FURS endpoint URLs in production.

## Authentication and authorization

For single-entity v1:

- machine-to-machine credentials per adapter;
- separate read and fiscalize permissions;
- operator console behind SSO/MFA;
- every privileged action audited.

For future multi-tenancy:

- tenant identity must be derived from authenticated credentials, never request body alone;
- signer lookup always scoped by tenant;
- row-level/Repository-level isolation with negative tests;
- separate encryption context and preferably separate keys per tenant;
- support immediate credential revocation.

## Logging rules

Allowlist, do not merely blacklist.

Acceptable examples:

- internal document UUID;
- legal-entity UUID (not tax number);
- state transition;
- attempt count;
- FURS error code/category;
- latency;
- certificate fingerprint suffix and days to expiry;
- cryptographic hash of redacted canonical payload.

Forbidden:

- certificate/P12/private key/password;
- raw JWS/JWT;
- full payload/response;
- full tax numbers;
- customer names/addresses/emails;
- card/payment secrets;
- unrestricted stack-local objects that may contain the above.

## Cryptography

- Use well-maintained primitives from Node and audited libraries.
- Keep custom code to canonicalization and protocol assembly; do not implement RSA itself.
- Verify response signature rather than accepting a decoded payload.
- Validate certificate chain and validity dates.
- Explicitly identify trust anchors and rotation process.
- Store algorithm identifiers and source version in evidence metadata.
- Test with mutated tokens and certificates.

## Database integrity

- Use append-only attempt/audit tables.
- Restrict update/delete permissions on confirmed documents.
- Use uniqueness constraints for fiscal identities and idempotency keys.
- Include canonical payload/evidence hashes.
- Treat sequence counters as critical state during backup/restore.
- After restore, reconcile counters against all fiscal documents before issuing new invoices.

## Incident priorities

### Suspected certificate compromise

1. Stop new fiscal submissions through the affected certificate.
2. Preserve audit/evidence.
3. Notify the designated responsible person and follow FURS/certificate revocation procedure.
4. Rotate credentials and certificate.
5. Reconcile all documents during the suspected window.
6. Document impact and corrective action.

### Response-verification failure

1. Do not mark invoice confirmed.
2. Place operation in `MANUAL_REVIEW`.
3. Preserve raw material only in encrypted restricted incident storage.
4. Check trust-chain/specification change and FURS status.
5. Never bypass verification to clear the queue.

### Backlog/outage

1. Continue durable recording of issued documents according to approved outage procedure.
2. Alert on age/deadline.
3. Retry using unchanged identity/payload/ZOI.
4. Escalate records approaching or exceeding the required later-submission deadline.

## Security release gate

No production release with:

- disabled TLS verification;
- unsigned/unverified responses;
- secrets in image or repository;
- critical/high vulnerabilities without accepted mitigation;
- unrestricted public fiscalization endpoint;
- untested backup/restore;
- missing certificate-expiry or retry-age alerting;
- mutable confirmed fiscal records.
