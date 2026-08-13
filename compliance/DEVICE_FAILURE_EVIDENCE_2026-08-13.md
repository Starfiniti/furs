# Issuing-device failure boundary evidence — 13 August 2026

Requirements: `FURS-DEV-001`, `FURS-AUD-001`, `FURS-SEC-002` and
`FURS-REL-001`.

Scope: live local API/PostgreSQL test using a dedicated non-production issuing
device identifier. No request was sent to FURS, because the required behavior is
to block ordinary electronic issuance before a fiscal document or delivery job
can exist.

## Result

- The API and PostgreSQL runtime were healthy and the outbox was empty before
  the drill.
- A dedicated test device was configured operational and then explicitly marked
  non-operational.
- A fresh ordinary `STANDARD` invoice command used `subsequentSubmit: false`.
- The API rejected the command with `FURS_DEVICE_FALLBACK_REQUIRED`.
- The command's unique message ID was absent from the authenticated operator
  document listing after rejection.
- Total fiscal-document counts were unchanged and the active outbox count
  remained zero.
- The dedicated device was explicitly left non-operational after the drill.

Protected evidence result:

- run ID: `device-failure-20260813-131303`;
- scenario SHA-256:
  `f3f3ff824e599fa3ffd623b5645b294d45a34c05986157e9a3644222dd2000c8`;
- redacted evidence SHA-256:
  `733255e51072f97083d73155e0df1514c8ebdd78f5fb47f63069f607d140ccfb`;
- protected evidence-file SHA-256:
  `79416562e205ba72b19565ddba4a1d10a2408daafd0d67b72cb4c780a615196a`.

The protected scenario and result are outside the repository. Effective access
is limited to the local operator and `SYSTEM`. The committed report contains no
tax number, token, invoice payload, certificate material, message ID or customer
data.

## Deliberate limitation

This proves the technical distinction from a FURS connectivity outage: no
network retry or subsequent-submission flow was used. It does **not** claim that
an operator completed a paper VKR/sales-book procedure, that a later
`SalesBookInvoice` was reconciled, or that an accountant/legal reviewer approved
the production procedure. The protected result therefore records
`humanVkrProcedureExecuted: false` and `productionVkrApproval: false`. Those
human/legal steps remain a release gate.
