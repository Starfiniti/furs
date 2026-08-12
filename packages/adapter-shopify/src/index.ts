import { createHmac, timingSafeEqual } from 'node:crypto';
import { processFinalizedPlatformFiscalEvent, type FinalizedPlatformFiscalEvent, type FiscalGateway, type FiscalResultMetadataSink, type PlatformFiscalEventResult } from '@starfiniti/furs-service-contract';
export type ShopifyTopic = 'orders/paid' | 'refunds/create';
export interface ShopifyFiscalEvent extends FinalizedPlatformFiscalEvent { readonly shopDomain: string; readonly resourceId: string; readonly topic: ShopifyTopic; }
export type UnverifiedShopifyFiscalEvent = Omit<ShopifyFiscalEvent, 'signatureVerified'>;
export interface VerifiedShopifyWebhookInput {
  readonly rawBody: string | Uint8Array;
  readonly hmacHeader: string | undefined;
  readonly clientSecret: string;
  readonly event: UnverifiedShopifyFiscalEvent;
}
export function handleShopifyFiscalEvent(event: ShopifyFiscalEvent, gateway: FiscalGateway, metadata: FiscalResultMetadataSink): Promise<PlatformFiscalEventResult> {
  if (!['orders/paid', 'refunds/create'].includes(event.topic)) throw new Error('Unsupported Shopify fiscal topic');
  return processFinalizedPlatformFiscalEvent('shopify', { ...event, aggregateId: `${event.shopDomain}:${event.resourceId}` }, gateway, metadata);
}

/** Official Shopify HTTPS webhook verification over the untouched request body. */
export function verifyShopifyWebhookHmac(rawBody: string | Uint8Array, hmacHeader: string | undefined, clientSecret: string): boolean {
  if (typeof hmacHeader !== 'string' || hmacHeader.length < 1 || hmacHeader.length > 256 || typeof clientSecret !== 'string' || clientSecret.length < 1) return false;
  let provided: Buffer;
  try { provided = Buffer.from(hmacHeader, 'base64'); } catch { return false; }
  if (provided.length !== 32 || provided.toString('base64') !== hmacHeader) return false;
  const calculated = createHmac('sha256', clientSecret).update(rawBody).digest();
  return timingSafeEqual(provided, calculated);
}

export function assertVerifiedShopifyWebhook(rawBody: string | Uint8Array, hmacHeader: string | undefined, clientSecret: string): void {
  if (!verifyShopifyWebhookHmac(rawBody, hmacHeader, clientSecret)) throw new Error('Shopify webhook HMAC verification failed');
}

/** Preferred boundary: authentication succeeds before the event can be fiscalized. */
export function handleVerifiedShopifyWebhook(input: VerifiedShopifyWebhookInput, gateway: FiscalGateway, metadata: FiscalResultMetadataSink): Promise<PlatformFiscalEventResult> {
  assertVerifiedShopifyWebhook(input.rawBody, input.hmacHeader, input.clientSecret);
  return handleShopifyFiscalEvent({ ...input.event, signatureVerified: true }, gateway, metadata);
}
