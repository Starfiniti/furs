import { createHash } from 'node:crypto';

import {
  decideRetry,
  FursDomainError,
  type DeliveryFailureKind
} from '@starfiniti/furs-core';
import type {
  ClaimedOutboxJob,
  CompletedAttemptInput,
  PendingWebhookDelivery,
  PostgresFiscalRepository,
  StoredFiscalDocument
} from '@starfiniti/furs-persistence-postgres';

import type { FiscalSubmissionClient } from './submission-client.js';
import type { WebhookDeliveryClient } from './webhook-client.js';

export interface WorkerRepository {
  claimOutboxJobs(workerId: string, limit?: number): Promise<readonly ClaimedOutboxJob[]>;
  getFiscalDocument(id: string): Promise<StoredFiscalDocument | undefined>;
  startSending(documentId: string, workerId: string): Promise<void>;
  confirm(attempt: CompletedAttemptInput, eor: string, certificateFingerprint256: string): Promise<void>;
  reject(attempt: CompletedAttemptInput): Promise<void>;
  confirmBusinessPremise(attempt: CompletedAttemptInput, certificateFingerprint256: string): Promise<void>;
  rejectBusinessPremise(attempt: CompletedAttemptInput): Promise<void>;
  scheduleRetry(attempt: CompletedAttemptInput, availableAt: Date): Promise<void>;
  markIssuedWithoutEor(attempt: CompletedAttemptInput, availableAt: Date): Promise<void>;
  markManualReview(attempt: CompletedAttemptInput): Promise<void>;
  getPendingWebhookDelivery(documentId: string): Promise<PendingWebhookDelivery | undefined>;
  completeWebhook(job: ClaimedOutboxJob, delivery: PendingWebhookDelivery, deliveredAt: Date): Promise<void>;
  retryWebhook(job: ClaimedOutboxJob, delivery: PendingWebhookDelivery, availableAt: Date, errorCode: string): Promise<void>;
  deadLetterWebhook(job: ClaimedOutboxJob, delivery: PendingWebhookDelivery, errorCode: string, completedAt: Date): Promise<void>;
  recoverStaleOutboxJobs(staleBefore: Date): Promise<number>;
  heartbeatWorker(workerId: string, observedAt: Date): Promise<void>;
}

export interface WorkerOptions {
  readonly repository: WorkerRepository | PostgresFiscalRepository;
  readonly submissionClient: FiscalSubmissionClient;
  readonly webhookClient?: WebhookDeliveryClient;
  readonly workerId: string;
  readonly concurrency?: number;
  readonly clock?: () => Date;
  readonly random?: () => number;
  readonly maximumAttempts?: number;
  readonly assertSubmissionReady?: () => void | Promise<void>;
}

export interface PollResult {
  readonly claimed: number;
  readonly confirmed: number;
  readonly rejected: number;
  readonly retried: number;
  readonly manualReview: number;
  readonly webhookDelivered: number;
  readonly webhookRetried: number;
  readonly webhookDead: number;
}

function failureKind(error: unknown): DeliveryFailureKind {
  const code = error instanceof FursDomainError ? error.code : error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  if (
    code === 'FURS_CLOCK_NOT_READY' || code === 'FURS_TLS_TIMEOUT' || code === 'FURS_TLS_RESPONSE_ABORTED' ||
    code === 'ECONNABORTED' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' || code === 'ENOTFOUND' || code === 'EPIPE' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN'
  ) return 'CONNECTION_TEMPORARY';
  if (code === 'FURS_TLS_HTTP_RETRYABLE') return 'HTTP_SERVER_ERROR';
  if (code === 'FURS_TLS_HTTP_CLIENT') return 'HTTP_CLIENT_ERROR';
  if (typeof code === 'string' && (code.startsWith('FURS_JWS_') || code.startsWith('FURS_RESPONSE_') || code.startsWith('FURS_SCHEMA_'))) return 'INVALID_SIGNED_RESPONSE';
  if (typeof code === 'string' && (code.startsWith('FURS_CERT_') || code.startsWith('FURS_TLS_'))) return 'CERTIFICATE_OR_TLS_CONFIGURATION';
  return 'UNKNOWN_DELIVERY_OUTCOME';
}

function errorCode(error: unknown): string {
  const raw = error instanceof FursDomainError ? error.code : error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  return typeof raw === 'string' && /^[A-Z0-9_:-]{1,100}$/.test(raw) ? raw : 'UNKNOWN_DELIVERY_OUTCOME';
}

function digest(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }

export class FiscalWorker {
  readonly #options: WorkerOptions;

  public constructor(options: WorkerOptions) {
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(options.workerId)) throw new Error('Worker ID is invalid');
    if (options.concurrency !== undefined && (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 100)) {
      throw new Error('Worker concurrency must be between 1 and 100');
    }
    this.#options = options;
  }

  public async recoverStaleLeases(maximumAgeMs = 300_000): Promise<number> {
    return this.#options.repository.recoverStaleOutboxJobs(new Date(this.#now().getTime() - maximumAgeMs));
  }

  public async pollOnce(): Promise<PollResult> {
    const jobs = await this.#options.repository.claimOutboxJobs(this.#options.workerId, this.#options.concurrency ?? 1);
    const counts = {
      claimed: jobs.length, confirmed: 0, rejected: 0, retried: 0, manualReview: 0,
      webhookDelivered: 0, webhookRetried: 0, webhookDead: 0
    };
    const outcomes = await Promise.all(jobs.map((job) => this.#process(job)));
    for (const outcome of outcomes) {
      counts[outcome] += 1;
    }
    return Object.freeze(counts);
  }

  public async run(signal: AbortSignal, idleDelayMs = 250): Promise<void> {
    await this.recoverStaleLeases();
    let nextHeartbeatAt = 0;
    while (!signal.aborted) {
      const now = this.#now();
      if (now.getTime() >= nextHeartbeatAt) {
        await this.#options.repository.heartbeatWorker(this.#options.workerId, now);
        nextHeartbeatAt = now.getTime() + 10_000;
      }
      const result = await this.pollOnce();
      if (result.claimed === 0) await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, idleDelayMs);
        signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
  }

  async #process(job: ClaimedOutboxJob): Promise<keyof Omit<PollResult, 'claimed'>> {
    if (job.jobType === 'WEBHOOK') return this.#processWebhook(job);
    const document = await this.#options.repository.getFiscalDocument(job.documentId);
    if (document === undefined) throw new Error('Claimed outbox document does not exist');
    const startedAt = this.#now();
    let verifiedResponse: Awaited<ReturnType<FiscalSubmissionClient['submit']>> | undefined;
    try {
      await this.#options.repository.startSending(document.id, this.#options.workerId);
      await this.#options.assertSubmissionReady?.();
      const result = await this.#options.submissionClient.submit(document.payloadJson, document.messageId, document.operationClass);
      verifiedResponse = result;
      const finishedAt = this.#now();
      const common = this.#attempt(job, document, startedAt, finishedAt, digest(result.responsePayloadJson), result.certificateFingerprint256);
      if (result.kind === 'confirmed') {
        if (document.operationClass === 'BUSINESS_PREMISE') {
          await this.#options.repository.confirmBusinessPremise(
            { ...common, outcome: 'CONFIRMED' }, result.certificateFingerprint256
          );
        } else {
          if (result.eor === undefined) throw new FursDomainError('FURS_RESPONSE_EOR', 'Invoice confirmation has no EOR');
          await this.#options.repository.confirm(
            { ...common, outcome: 'CONFIRMED' }, result.eor, result.certificateFingerprint256
          );
        }
        return 'confirmed';
      }
      const rejection = { ...common, outcome: 'REJECTED' as const, errorCode: result.errorCode };
      if (document.operationClass === 'BUSINESS_PREMISE') await this.#options.repository.rejectBusinessPremise(rejection);
      else await this.#options.repository.reject(rejection);
      return 'rejected';
    } catch (error) {
      const finishedAt = this.#now();
      const kind = failureKind(error);
      const common = this.#attempt(
        job, document, startedAt, finishedAt,
        verifiedResponse === undefined ? undefined : digest(verifiedResponse.responsePayloadJson),
        verifiedResponse?.certificateFingerprint256
      );
      const code = errorCode(error);
      if (kind === 'CONNECTION_TEMPORARY' || kind === 'HTTP_SERVER_ERROR') {
        const decision = decideRetry({ attemptNumber: job.attemptCount, maximumAttempts: this.#options.maximumAttempts ?? 8 });
        if (decision.retry && decision.delayMs !== undefined) {
          const jitter = Math.floor(decision.delayMs * 0.2 * (this.#options.random?.() ?? Math.random()));
          const retryAt = new Date(finishedAt.getTime() + decision.delayMs + jitter);
          const retryAttempt = { ...common, outcome: 'RETRYABLE_FAILURE' as const, errorCode: code };
          if (document.subsequentSubmit) {
            await this.#options.repository.markIssuedWithoutEor(retryAttempt, retryAt);
          } else {
            await this.#options.repository.scheduleRetry(retryAttempt, retryAt);
          }
          return 'retried';
        }
      }
      await this.#options.repository.markManualReview({
        ...common,
        outcome: kind === 'INVALID_SIGNED_RESPONSE' || kind === 'CERTIFICATE_OR_TLS_CONFIGURATION' ? 'SECURITY_FAILURE' : 'UNKNOWN_OUTCOME',
        errorCode: code
      });
      return 'manualReview';
    }
  }

  async #processWebhook(job: ClaimedOutboxJob): Promise<'webhookDelivered' | 'webhookRetried' | 'webhookDead'> {
    const delivery = await this.#options.repository.getPendingWebhookDelivery(job.documentId);
    if (delivery === undefined) throw new FursDomainError('FURS_WEBHOOK_STATE', 'Claimed webhook delivery does not exist');
    const now = this.#now();
    if (this.#options.webhookClient === undefined) {
      await this.#options.repository.deadLetterWebhook(job, delivery, 'FURS_WEBHOOK_NOT_CONFIGURED', now);
      return 'webhookDead';
    }
    try {
      await this.#options.webhookClient.deliver(delivery, now);
      await this.#options.repository.completeWebhook(job, delivery, this.#now());
      return 'webhookDelivered';
    } catch (error) {
      const code = errorCode(error);
      const retryable = code === 'FURS_WEBHOOK_TIMEOUT' || code === 'FURS_WEBHOOK_CONNECTION' || code === 'FURS_WEBHOOK_HTTP_RETRYABLE';
      const decision = retryable
        ? decideRetry({ attemptNumber: job.attemptCount, maximumAttempts: this.#options.maximumAttempts ?? 8 })
        : { retry: false, delayMs: undefined };
      if (decision.retry && decision.delayMs !== undefined) {
        const jitter = Math.floor(decision.delayMs * 0.2 * (this.#options.random?.() ?? Math.random()));
        await this.#options.repository.retryWebhook(
          job, delivery, new Date(this.#now().getTime() + decision.delayMs + jitter), code
        );
        return 'webhookRetried';
      }
      await this.#options.repository.deadLetterWebhook(job, delivery, code, this.#now());
      return 'webhookDead';
    }
  }

  #attempt(
    job: ClaimedOutboxJob,
    document: StoredFiscalDocument,
    startedAt: Date,
    finishedAt: Date,
    responseSha256?: string,
    certificateFingerprint256?: string
  ): Omit<CompletedAttemptInput, 'outcome'> {
    return {
      jobId: job.id, workerId: this.#options.workerId, documentId: document.id,
      attemptNumber: job.attemptCount, requestSha256: document.payloadSha256,
      ...(responseSha256 === undefined ? {} : { responseSha256 }),
      ...(certificateFingerprint256 === undefined ? {} : { certificateFingerprint256 }),
      startedAt, finishedAt
    };
  }

  #now(): Date { return new Date((this.#options.clock?.() ?? new Date()).getTime()); }
}
