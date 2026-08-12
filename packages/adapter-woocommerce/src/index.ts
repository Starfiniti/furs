import { createHmac, timingSafeEqual } from 'node:crypto';
import { processFinalizedPlatformFiscalEvent, type FinalizedPlatformFiscalEvent, type FiscalGateway, type FiscalResultMetadataSink, type PlatformFiscalEventResult } from '@starfiniti/furs-service-contract';

export type WooCommerceHook = 'woocommerce_payment_complete' | 'woocommerce_order_refunded';
export interface WooCommerceFiscalEvent extends FinalizedPlatformFiscalEvent {
  readonly siteId: string; readonly orderId: string; readonly hook: WooCommerceHook;
}
export type UnverifiedWooCommerceFiscalEvent = Omit<WooCommerceFiscalEvent, 'signatureVerified'>;
export interface VerifiedWooCommerceWebhookInput {
  readonly rawBody: string | Uint8Array;
  readonly signatureHeader: string | undefined;
  readonly webhookSecret: string;
  readonly event: UnverifiedWooCommerceFiscalEvent;
}

export function handleWooCommerceFiscalEvent(event: WooCommerceFiscalEvent, gateway: FiscalGateway, metadata: FiscalResultMetadataSink): Promise<PlatformFiscalEventResult> {
  if (!['woocommerce_payment_complete', 'woocommerce_order_refunded'].includes(event.hook)) throw new Error('Unsupported WooCommerce fiscal hook');
  return processFinalizedPlatformFiscalEvent('woocommerce', { ...event, aggregateId: `${event.siteId}:${event.orderId}` }, gateway, metadata);
}

/** Official WooCommerce webhook verification over the already encoded raw body. */
export function verifyWooCommerceWebhookHmac(rawBody: string | Uint8Array, signatureHeader: string | undefined, webhookSecret: string): boolean {
  if (typeof signatureHeader !== 'string' || signatureHeader.length < 1 || signatureHeader.length > 256 || typeof webhookSecret !== 'string' || webhookSecret.length < 1) return false;
  let provided: Buffer;
  try { provided = Buffer.from(signatureHeader, 'base64'); } catch { return false; }
  if (provided.length !== 32 || provided.toString('base64') !== signatureHeader) return false;
  const calculated = createHmac('sha256', webhookSecret).update(rawBody).digest();
  return timingSafeEqual(provided, calculated);
}

export function assertVerifiedWooCommerceWebhook(rawBody: string | Uint8Array, signatureHeader: string | undefined, webhookSecret: string): void {
  if (!verifyWooCommerceWebhookHmac(rawBody, signatureHeader, webhookSecret)) throw new Error('WooCommerce webhook HMAC verification failed');
}

/** Preferred boundary: authentication succeeds before the event can be fiscalized. */
export function handleVerifiedWooCommerceWebhook(input: VerifiedWooCommerceWebhookInput, gateway: FiscalGateway, metadata: FiscalResultMetadataSink): Promise<PlatformFiscalEventResult> {
  assertVerifiedWooCommerceWebhook(input.rawBody, input.signatureHeader, input.webhookSecret);
  return handleWooCommerceFiscalEvent({ ...input.event, signatureVerified: true }, gateway, metadata);
}
