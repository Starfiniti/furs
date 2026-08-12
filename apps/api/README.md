# Starfiniti FURS API

Fastify REST process for validated command intake and durable PostgreSQL
persistence. Authentication is mandatory outside the two health endpoints.
The API does not send fiscal messages in the request thread; a transaction
stores the immutable command, idempotency record, outbox job and audit event.

The process is composed through `buildApi`, keeping secret loading and runtime
configuration outside HTTP handlers.
