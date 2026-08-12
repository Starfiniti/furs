# Phase 0 status

Last updated: 12 August 2026
Requirement: `FURS-SRC-001`
Gate: P0 — incomplete

## Completed repository controls

- The official-source registry and source-change checker exist.
- The checker fails closed for missing, invalid, changed, or unreviewed baselines.
- Stable official PISRS integration PDFs are monitored instead of the JavaScript application shell.
- Volatile eDavki page state is removed before content hashing while meaningful page content remains covered.
- Expected media types, PDF signatures, JSON parsing, and version markers are checked where applicable.
- Automated policy/content tests and GitHub Actions jobs exist.
- The compliance-sensitive pull-request template requires requirement, source, test, security, migration, and test-environment evidence.
- The architecture decisions, requirements matrix, threat model, data classification, test plan, and test-certificate request template exist.
- Dejan Kletečki reviewed and accepted the initial official-source digests on 12 August 2026.
  The latest source check still reports the FURS technical documents, schemas,
  legislation and general SPOT guidance unchanged, but detects a changed
  online-retail SPOT digest. The affected payment/adaptor policy is frozen in
  `SOURCE_CHANGE_REVIEW_2026-08-12.md` pending specialist review.
- The FURS developer test-certificate request was sent to `sd.fu@gov.si` on 12 August 2026.
- A local certificate directory was prepared outside Git and Nextcloud with ACL inheritance disabled and access limited to the current Windows user and SYSTEM.
- Dejan Kletečki is recorded as project owner, internal security owner and
  internal source-baseline reviewer in `docs/GOVERNANCE.md`.

## Gate blockers

- The external accountant/tax-specialist reviewer and final production
  compliance owner have not yet been identified.
- The supported v1 payment/business-scenario matrix has not been completed and approved by a Slovenian accountant or tax/legal specialist.
- Final licensing has not received legal review.

Phase 1 protocol integration and any production-readiness claim remain blocked until the applicable P0 requirements are resolved. Safe repository tooling and non-normative test scaffolding may continue without weakening this gate.
