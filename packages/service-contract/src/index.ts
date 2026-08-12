export { FursApiClient, FursApiClientError } from './client.js';
export type { FursApiClientOptions } from './client.js';
export * from './openapi.js';
export * from './schemas.js';
export * from './examples.js';
export type * from './types.js';
export { createPlatformIdempotencyKey, processFinalizedPlatformFiscalEvent } from './adapter.js';
export type {
  FinalizedPlatformFiscalEvent, FiscalGateway, FiscalResultMetadataSink,
  PlatformFiscalEventResult, ReviewedFiscalizationDecision
} from './adapter.js';
export { processSignedFiscalResultWebhook, verifySignedFiscalResultWebhook } from './result-webhook.js';
export type {
  FiscalResultUpdateSink, SignedFiscalResultWebhookInput, VerifiedFiscalResult
} from './result-webhook.js';
