# Codex start prompt

You are implementing the Starfiniti FURS Kit: an unofficial, open-source, enterprise-grade engine for Slovenian FURS invoice fiscalization.

Before coding:

1. Read `AGENTS.md`, `IMPLEMENTATION_PLAN.md`, `ARCHITECTURE.md`, `COMPLIANCE_MATRIX.md`, `SECURITY.md`, `TEST_PLAN.md`, and `compliance/SOURCE_REGISTER.md`.
2. Run `node scripts/check-official-sources.mjs` if internet access is available.
3. Do not treat existing GitHub/npm FURS libraries as normative sources.
4. Work only on the earliest incomplete phase gate. Do not jump to UI or adapters.
5. Begin with Phase 0 verification and Phase 1 cryptographic/transport spike.

Mandatory properties:

- exact decimal values; never JS floating-point as legal source of truth;
- one immutable `Europe/Ljubljana` invoice local time;
- independently tested payload, ZOI, and receipt-code time formats;
- exact ZOI construction and RSA-SHA256 signing;
- outbound JWS RS256;
- cryptographic verification of FURS response JWS and certificate chain;
- strict mutual TLS;
- official schema validation;
- immutable fiscal identity and confirmed documents;
- mandatory idempotency and durable retry/outage workflow;
- no secrets or personal fiscal data in logs.

For each step:

- research current official sources where anything is uncertain;
- map work to requirement IDs;
- write tests before or with implementation;
- run typecheck, lint, unit tests, security checks, and relevant integration tests;
- update `docs/DECISIONS.md` when a material design choice is made;
- update the implementation plan when verified findings require improvement;
- report what passed, what failed, and which human review remains.

Do not claim production readiness until all release gates in `TEST_PLAN.md` pass, including test-environment evidence, two-day soak, security review, certificate rotation rehearsal, backup/restore test, and Slovenian accountant/tax/legal scenario signoff.
