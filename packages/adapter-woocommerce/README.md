# @starfiniti/furs-adapter-woocommerce

Replay-safe WooCommerce hook adapter. WordPress must verify hook authenticity
and provide the finalized, accountant-reviewed fiscal command. The FURS
certificate remains in the private fiscal service, never in WordPress.

`verifyWooCommerceWebhookHmac` verifies `X-WC-Webhook-Signature` as the official
base64 HMAC-SHA256 of the already encoded raw payload. Do not parse/re-encode the
body first. Protocol reference:
<https://woocommerce.github.io/code-reference/classes/WC-Webhook.html>.

Use `handleVerifiedWooCommerceWebhook` at the HTTP boundary so authenticity
cannot be replaced by a caller-supplied boolean.
Use the service contract's `processSignedFiscalResultWebhook` for terminal
status updates and deduplicate them by webhook ID.
