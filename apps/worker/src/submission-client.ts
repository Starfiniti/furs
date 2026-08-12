import {
  FursDomainError,
  MessageId,
  signJws,
  verifyBusinessPremiseResponseJws,
  verifyInvoiceResponseJws,
  type FiscalSigner,
  type FursMtlsTransport,
  type PinnedOfficialSchemaValidator,
  type VerifyFursJwsOptions
} from '@starfiniti/furs-core';

export type SubmissionResult =
  | { readonly kind: 'confirmed'; readonly eor: string | undefined; readonly responsePayloadJson: string; readonly certificateFingerprint256: string }
  | { readonly kind: 'rejected'; readonly errorCode: string; readonly responsePayloadJson: string; readonly certificateFingerprint256: string };

export interface FiscalSubmissionClient {
  submit(payloadJson: string, messageId: string, operationClass: 'FISCAL_INVOICE' | 'BUSINESS_PREMISE'): Promise<SubmissionResult>;
}

export interface VerifiedSubmissionClientOptions {
  readonly signer: FiscalSigner;
  readonly transport: Pick<FursMtlsTransport, 'send'>;
  readonly responseSchema: PinnedOfficialSchemaValidator;
  readonly responseJws: VerifyFursJwsOptions;
}

function responseToken(body: string): string {
  let value: unknown;
  try { value = JSON.parse(body); }
  catch { throw new FursDomainError('FURS_RESPONSE_WRAPPER_JSON', 'FURS response wrapper is not valid JSON'); }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FursDomainError('FURS_RESPONSE_WRAPPER', 'FURS response wrapper must be an object');
  }
  const token = (value as Record<string, unknown>).token;
  if (typeof token !== 'string') throw new FursDomainError('FURS_RESPONSE_TOKEN', 'FURS response wrapper has no token');
  return token;
}

export class VerifiedFiscalSubmissionClient implements FiscalSubmissionClient {
  readonly #options: VerifiedSubmissionClientOptions;

  public constructor(options: VerifiedSubmissionClientOptions) { this.#options = options; }

  public async submit(
    payloadJson: string,
    messageId: string,
    operationClass: 'FISCAL_INVOICE' | 'BUSINESS_PREMISE'
  ): Promise<SubmissionResult> {
    const signed = await signJws(payloadJson, this.#options.signer);
    const transportResponse = await this.#options.transport.send(
      operationClass === 'FISCAL_INVOICE' ? 'invoices' : 'business-premises',
      JSON.stringify(signed.wrapper)
    );
    const token = responseToken(transportResponse.body);
    const verificationOptions = {
      jws: this.#options.responseJws,
      schema: this.#options.responseSchema,
      expectedMessageId: MessageId.parse(messageId)
    };
    if (operationClass === 'BUSINESS_PREMISE') {
      const verified = verifyBusinessPremiseResponseJws(token, verificationOptions);
      if (verified.kind === 'accepted') {
        return Object.freeze({
          kind: 'confirmed', eor: undefined, responsePayloadJson: transportResponse.body,
          certificateFingerprint256: verified.signerFingerprint256
        });
      }
      return Object.freeze({
        kind: 'rejected', errorCode: verified.error.code.toUpperCase(),
        responsePayloadJson: transportResponse.body, certificateFingerprint256: verified.signerFingerprint256
      });
    }
    const verified = verifyInvoiceResponseJws(token, verificationOptions);
    if (verified.kind === 'confirmed') {
      return Object.freeze({
        kind: 'confirmed', eor: verified.eor.toString(), responsePayloadJson: transportResponse.body,
        certificateFingerprint256: verified.signerFingerprint256
      });
    }
    return Object.freeze({
      kind: 'rejected', errorCode: verified.error.code.toUpperCase(),
      responsePayloadJson: transportResponse.body, certificateFingerprint256: verified.signerFingerprint256
    });
  }
}
