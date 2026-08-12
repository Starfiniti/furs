# @starfiniti/furs-service-contract

Language-neutral REST contract, JSON Schemas and OpenAPI 3.1 document for the
Starfiniti FURS service. The invoice request is finalized by the caller; money,
tax and receipt policy are never recalculated by this package.

The generated OpenAPI document is exported as `openApiDocument`. Every API
response uses the same safe error envelope and never contains certificate
material or raw signed JWS tokens.

`processSignedFiscalResultWebhook` is the shared adapter return boundary. It
verifies the service HMAC over `timestamp.rawBody`, enforces a replay window,
accepts only complete terminal results, and passes the durable webhook ID to a
platform sink that must deduplicate before acknowledging delivery.
