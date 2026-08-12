# @starfiniti/furs-adapter-medusa

Replay-safe Medusa subscriber adapter for finalized payment and refund events.
Commercial totals and fiscalization policy remain upstream and reviewed.

The supported Medusa v2.18 workflow events are `payment.captured` and
`payment.refunded`, as listed in the current official Events Reference:
<https://docs.medusajs.com/resources/references/events>.

Consume terminal service updates with `processSignedFiscalResultWebhook` from
the service contract and durably deduplicate by its webhook ID.
