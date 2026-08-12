import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { FursDomainError } from '@starfiniti/furs-core';
import type { PendingWebhookDelivery } from '@starfiniti/furs-persistence-postgres';

export interface WebhookDeliveryClient {
  deliver(delivery: PendingWebhookDelivery, deliveredAt: Date): Promise<void>;
}

export interface SignedWebhookClientOptions {
  readonly destinationId: string;
  readonly url: string;
  readonly secret: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export class SignedWebhookClient implements WebhookDeliveryClient {
  readonly #options: SignedWebhookClientOptions;

  public constructor(options: SignedWebhookClientOptions) {
    if (options.secret.length < 32) throw new Error('Webhook secret must contain at least 32 characters');
    if (!Number.isSafeInteger(options.timeoutMs ?? 10_000) || (options.timeoutMs ?? 10_000) < 100 || (options.timeoutMs ?? 10_000) > 60_000) {
      throw new Error('Webhook timeout is invalid');
    }
    this.#options = options;
  }

  public async deliver(delivery: PendingWebhookDelivery, deliveredAt: Date): Promise<void> {
    if (delivery.destinationId !== this.#options.destinationId) {
      throw new FursDomainError('FURS_WEBHOOK_DESTINATION', 'Claimed webhook has no configured destination');
    }
    const actualDigest = createHash('sha256').update(delivery.payloadJson, 'utf8').digest();
    const expectedDigest = Buffer.from(delivery.payloadSha256, 'hex');
    if (expectedDigest.length !== actualDigest.length || !timingSafeEqual(expectedDigest, actualDigest)) {
      throw new FursDomainError('FURS_WEBHOOK_PAYLOAD_HASH', 'Stored webhook payload hash does not match');
    }
    const timestamp = Math.floor(deliveredAt.getTime() / 1000).toString();
    const signature = createHmac('sha256', this.#options.secret)
      .update(`${timestamp}.`, 'utf8').update(delivery.payloadJson, 'utf8').digest('hex');
    let response: Response;
    try {
      response = await (this.#options.fetch ?? globalThis.fetch)(this.#options.url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.#options.timeoutMs ?? 10_000),
        headers: {
          'content-type': 'application/json',
          'x-starfiniti-webhook-id': delivery.id,
          'x-starfiniti-webhook-timestamp': timestamp,
          'x-starfiniti-webhook-signature': `v1=${signature}`
        },
        body: delivery.payloadJson
      });
    } catch (error) {
      const code = error instanceof Error && error.name === 'TimeoutError' ? 'FURS_WEBHOOK_TIMEOUT' : 'FURS_WEBHOOK_CONNECTION';
      throw new FursDomainError(code, 'Webhook delivery failed before an HTTP response');
    }
    if (response.status < 200 || response.status >= 300) {
      const category = response.status === 408 || response.status === 429 || response.status >= 500 ? 'RETRYABLE' : 'PERMANENT';
      throw new FursDomainError(`FURS_WEBHOOK_HTTP_${category}`, 'Webhook destination rejected the delivery');
    }
  }
}
