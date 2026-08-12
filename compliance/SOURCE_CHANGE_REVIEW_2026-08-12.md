# Official source change review — 12 August 2026

## Detection

`node scripts/check-official-sources.mjs` detected a changed digest for the
official SPOT page `spot-online-retail`.

- Previous reviewed SHA-256: `9322d6456b96548c528ee6cdc4bde423cc3d8574f75655f6e8b6c48d1619afe0`
- Current SHA-256: `5c2ba4ebcc1874abafab95ea448a60f5f7a9349784f8989626ecc435078ee7c5`
- Current URL: <https://spot.gov.si/sl/dejavnosti-in-poklici/dejavnosti/trgovina-na-drobno-po-posti-ali-po-internetu/>

All monitored FURS technical documentation, official JSON schemas, ZDavPR,
the implementing regulation, and the general SPOT fiscal guidance still match
their reviewed baselines.

## Current relevant text and impact boundary

The current page states that most web-shop payments are treated as cash
turnover, identifies direct payment to a payment-service provider's transaction
account as non-cash, names UPN, PayPal and Moneta as examples not requiring
fiscal confirmation, and names cash on delivery, cards and Stripe as examples
that do require submission no later than delivery of goods or services.

The previous full page body was not retained, so the digest change cannot be
proved to be merely navigation, contact, legal-reference or other boilerplate.
No payment-method decision may therefore be changed or newly hard-coded from
this observation alone.

## Release decision

- Freeze accountant-dependent online-retail payment classification and adapter
  refund/payment policy until a human compares the current guidance and signs
  the scenario matrix.
- Continue core protocol, cryptography, schema, persistence, security and
  operational implementation because their higher-authority monitored sources
  are unchanged.
- Do not update the registered baseline digest until the review records the
  reviewer, review date and impact decision.

## Required human review

Reviewer: pending (Slovenian accountant/tax specialist)
Owner: Dejan Kletečki
Decision: pending
