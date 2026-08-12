# @starfiniti/furs-adapter-shopify

Replay-safe Shopify webhook adapter for paid orders and refunds. HMAC
verification and accountant-reviewed fiscalization policy are mandatory before
the event crosses this boundary.

`verifyShopifyWebhookHmac` verifies `X-Shopify-Hmac-SHA256` against the untouched
raw body using a constant-time comparison. Capture the raw bytes before JSON
parsing. Header/event deduplication remains backed by the fiscal API idempotency
key. Protocol reference: <https://shopify.dev/docs/apps/build/webhooks/verify-deliveries>.

Use `handleVerifiedShopifyWebhook` at the HTTP boundary. It verifies the raw
request and only then marks the normalized fiscal event as authenticated.
Use the service contract's `processSignedFiscalResultWebhook` for authenticated,
replay-safe terminal status updates in Shopify metadata.
