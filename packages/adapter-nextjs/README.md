# @starfiniti/furs-adapter-nextjs

Reference adapter for custom/Next.js applications. The application supplies a
finalized fiscal command and a reviewed policy decision; the adapter supplies
verified-event enforcement, deterministic idempotency, and safe metadata.

Use `processSignedFiscalResultWebhook` from `@starfiniti/furs-service-contract`
for the result endpoint so manual-review/rejected/confirmed state is written
back only after authenticating the untouched body. Deduplicate by webhook ID.
