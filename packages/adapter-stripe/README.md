# @starfiniti/furs-adapter-stripe

Replay-safe Stripe webhook adapter. Stripe payment success alone does not
decide Slovenian fiscalization; callers must attach a reviewed policy decision
and finalized invoice command after verifying the webhook signature.

`verifyStripeWebhookSignature` validates the timestamped raw-body `v1` HMAC and
enforces the documented five-minute replay window by default. A tolerance of
zero is rejected. Protocol reference: <https://docs.stripe.com/webhooks>.

Use `handleVerifiedStripeWebhook` at the HTTP boundary. It verifies timestamp
and signature before the fiscal event is accepted.
Use the service contract's `processSignedFiscalResultWebhook` for authenticated
terminal updates and durable webhook-ID replay protection.
