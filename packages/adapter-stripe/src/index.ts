import { createHmac, timingSafeEqual } from 'node:crypto';
import { processFinalizedPlatformFiscalEvent, type FinalizedPlatformFiscalEvent, type FiscalGateway, type FiscalResultMetadataSink, type PlatformFiscalEventResult } from '@starfiniti/furs-service-contract';
export type StripeFiscalEventType = 'payment_intent.succeeded' | 'charge.refunded';
export interface StripeFiscalEvent extends FinalizedPlatformFiscalEvent { readonly accountId: string; readonly objectId: string; readonly type: StripeFiscalEventType; }
export type UnverifiedStripeFiscalEvent = Omit<StripeFiscalEvent, 'signatureVerified'>;
export function handleStripeFiscalEvent(event: StripeFiscalEvent, gateway: FiscalGateway, metadata: FiscalResultMetadataSink): Promise<PlatformFiscalEventResult> {
  if (!['payment_intent.succeeded', 'charge.refunded'].includes(event.type)) throw new Error('Unsupported Stripe fiscal event');
  return processFinalizedPlatformFiscalEvent('stripe', { ...event, aggregateId: `${event.accountId}:${event.objectId}` }, gateway, metadata);
}

export interface StripeWebhookVerificationInput {
  readonly rawBody: string | Uint8Array;
  readonly signatureHeader: string | undefined;
  readonly endpointSecret: string;
  readonly now?: Date;
  readonly toleranceSeconds?: number;
}
export interface VerifiedStripeWebhookInput extends StripeWebhookVerificationInput {
  readonly event: UnverifiedStripeFiscalEvent;
}

/** Stripe raw-body HMAC verifier with the documented five-minute replay window. */
export function verifyStripeWebhookSignature(input: StripeWebhookVerificationInput): boolean {
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(tolerance) || tolerance < 1 || tolerance > 3600 || typeof input.signatureHeader !== 'string' || input.signatureHeader.length > 2048 || typeof input.endpointSecret !== 'string' || input.endpointSecret.length < 1) return false;
  const components = input.signatureHeader.split(',').map((component) => component.trim());
  const timestampText = components.find((component) => component.startsWith('t='))?.slice(2);
  const signatures = components.filter((component) => component.startsWith('v1=')).map((component) => component.slice(3));
  if (timestampText === undefined || !/^\d{1,20}$/.test(timestampText) || signatures.length === 0) return false;
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp)) return false;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isSafeInteger(nowSeconds) || Math.abs(nowSeconds - timestamp) > tolerance) return false;
  const calculated = createHmac('sha256', input.endpointSecret)
    .update(`${timestampText}.`, 'utf8').update(input.rawBody).digest();
  return signatures.some((signature) => {
    if (!/^[a-fA-F0-9]{64}$/.test(signature)) return false;
    return timingSafeEqual(Buffer.from(signature, 'hex'), calculated);
  });
}

export function assertVerifiedStripeWebhook(input: StripeWebhookVerificationInput): void {
  if (!verifyStripeWebhookSignature(input)) throw new Error('Stripe webhook signature verification failed');
}

/** Preferred boundary: authentication succeeds before the event can be fiscalized. */
export function handleVerifiedStripeWebhook(input: VerifiedStripeWebhookInput, gateway: FiscalGateway, metadata: FiscalResultMetadataSink): Promise<PlatformFiscalEventResult> {
  assertVerifiedStripeWebhook(input);
  return handleStripeFiscalEvent({ ...input.event, signatureVerified: true }, gateway, metadata);
}
