import { verify, X509Certificate } from 'node:crypto';

import { FursDomainError } from './domain-error.js';
import type { CertificateMetadata, FiscalSigner } from './fiscal-signer.js';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface SignedJws {
  readonly token: string;
  readonly wrapper: Readonly<{ token: string }>;
  readonly protectedHeaderJson: string;
  readonly payloadJson: string;
}

export interface VerifyFursJwsOptions {
  readonly trustAnchors: readonly (string | Buffer | X509Certificate)[];
  readonly now?: Date;
  readonly expectedLeafFingerprints256?: readonly string[];
}

export interface VerifiedFursJws<TPayload = unknown> {
  readonly protectedHeader: Readonly<Record<string, unknown>>;
  readonly payload: TPayload;
  readonly payloadJson: string;
  readonly signerCertificate: X509Certificate;
}

function encodeBase64Url(data: string | Uint8Array): string {
  return Buffer.from(data).toString('base64url');
}

function decodeBase64Url(value: string, label: string): Buffer {
  if (!BASE64URL_PATTERN.test(value)) {
    throw new FursDomainError('FURS_JWS_BASE64URL', `${label} is not canonical Base64URL`);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new FursDomainError('FURS_JWS_BASE64URL', `${label} is not canonical Base64URL`);
  }
  return decoded;
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new FursDomainError('FURS_JWS_JSON', `${label} is not valid JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new FursDomainError('FURS_JWS_JSON_OBJECT', `${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function serializeOutboundHeader(metadata: CertificateMetadata): string {
  if (!/^\d+$/.test(metadata.serialNumberDecimal)) {
    throw new FursDomainError('FURS_JWS_SERIAL', 'Certificate serial must be an unsigned decimal integer');
  }
  return `{"alg":"RS256","subject_name":${JSON.stringify(metadata.subjectName)},"issuer_name":${JSON.stringify(metadata.issuerName)},"serial":${metadata.serialNumberDecimal}}`;
}

/** Requirement: FURS-JWS-001. */
export async function signJws(payloadJson: string, signer: FiscalSigner): Promise<SignedJws> {
  parseJsonObject(payloadJson, 'JWS payload');
  const protectedHeaderJson = serializeOutboundHeader(signer.getCertificateMetadata());
  const encodedHeader = encodeBase64Url(protectedHeaderJson);
  const encodedPayload = encodeBase64Url(payloadJson);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await signer.signRsaSha256(Buffer.from(signingInput, 'ascii'));
  const token = `${signingInput}.${encodeBase64Url(signature)}`;

  return Object.freeze({
    token,
    wrapper: Object.freeze({ token }),
    protectedHeaderJson,
    payloadJson
  });
}

function decodeX5c(value: unknown): X509Certificate[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => typeof entry === 'string')) {
    throw new FursDomainError('FURS_JWS_X5C', 'FURS JWS header must contain a non-empty x5c array');
  }

  return value.map((entry) => {
    if (!BASE64_PATTERN.test(entry)) {
      throw new FursDomainError('FURS_JWS_X5C_BASE64', 'x5c certificate is not canonical Base64');
    }
    try {
      return new X509Certificate(Buffer.from(entry, 'base64'));
    } catch {
      throw new FursDomainError('FURS_JWS_X5C_CERT', 'x5c contains an invalid certificate');
    }
  });
}

function assertCertificateValidAt(certificate: X509Certificate, now: Date): void {
  const timestamp = now.getTime();
  if (
    !Number.isFinite(timestamp) ||
    timestamp < Date.parse(certificate.validFrom) ||
    timestamp > Date.parse(certificate.validTo)
  ) {
    throw new FursDomainError('FURS_JWS_CERT_VALIDITY', 'JWS certificate is not valid at verification time');
  }
}

function assertTrustedChain(
  chain: readonly X509Certificate[],
  trustAnchors: readonly X509Certificate[],
  now: Date
): void {
  for (const certificate of chain) assertCertificateValidAt(certificate, now);
  for (const anchor of trustAnchors) assertCertificateValidAt(anchor, now);

  for (let index = 0; index < chain.length - 1; index += 1) {
    const certificate = chain[index];
    const issuer = chain[index + 1];
    if (
      certificate === undefined ||
      issuer === undefined ||
      certificate.issuer !== issuer.subject ||
      !issuer.ca ||
      !certificate.verify(issuer.publicKey)
    ) {
      throw new FursDomainError('FURS_JWS_CERT_CHAIN', 'x5c certificate chain is invalid or out of order');
    }
  }

  const last = chain.at(-1);
  if (last === undefined) {
    throw new FursDomainError('FURS_JWS_CERT_CHAIN', 'x5c certificate chain is empty');
  }

  const trusted = trustAnchors.some((anchor) => {
    if (!anchor.ca) return false;
    if (last.raw.equals(anchor.raw)) return true;
    return last.issuer === anchor.subject && last.verify(anchor.publicKey);
  });
  if (!trusted) {
    throw new FursDomainError('FURS_JWS_CERT_TRUST', 'x5c chain does not terminate at a trusted anchor');
  }
}

/** Requirement: FURS-JWS-002. */
export function verifyFursJws<TPayload = unknown>(
  token: string,
  options: VerifyFursJwsOptions
): VerifiedFursJws<TPayload> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 1_000_000) {
    throw new FursDomainError('FURS_JWS_TOKEN', 'FURS JWS token length is invalid');
  }
  if (options.trustAnchors.length === 0) {
    throw new FursDomainError('FURS_JWS_TRUST', 'At least one response trust anchor is required');
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new FursDomainError('FURS_JWS_COMPACT', 'FURS JWS must contain exactly three non-empty parts');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (encodedHeader === undefined || encodedPayload === undefined || encodedSignature === undefined) {
    throw new FursDomainError('FURS_JWS_COMPACT', 'FURS JWS is malformed');
  }

  const headerJson = decodeBase64Url(encodedHeader, 'JWS header').toString('utf8');
  const protectedHeader = parseJsonObject(headerJson, 'JWS header');
  if (protectedHeader.alg !== 'RS256') {
    throw new FursDomainError('FURS_JWS_ALGORITHM', 'FURS JWS algorithm must be RS256');
  }
  if (protectedHeader.crit !== undefined) {
    throw new FursDomainError('FURS_JWS_CRITICAL', 'FURS JWS contains unsupported critical header parameters');
  }
  if (protectedHeader.b64 !== undefined && protectedHeader.b64 !== true) {
    throw new FursDomainError('FURS_JWS_PAYLOAD_ENCODING', 'FURS JWS must use Base64URL payload encoding');
  }

  const chain = decodeX5c(protectedHeader.x5c);
  const trustAnchors = options.trustAnchors.map((anchor) =>
    anchor instanceof X509Certificate ? anchor : new X509Certificate(anchor)
  );
  assertTrustedChain(chain, trustAnchors, options.now ?? new Date());

  const leaf = chain[0];
  if (leaf === undefined || leaf.publicKey.asymmetricKeyType !== 'rsa') {
    throw new FursDomainError('FURS_JWS_KEY_TYPE', 'FURS response signer must use RSA');
  }
  if (
    options.expectedLeafFingerprints256 &&
    !options.expectedLeafFingerprints256
      .map((fingerprint) => fingerprint.toLowerCase())
      .includes(leaf.fingerprint256.toLowerCase())
  ) {
    throw new FursDomainError('FURS_JWS_SIGNER', 'FURS response signer is not an expected certificate');
  }

  const signature = decodeBase64Url(encodedSignature, 'JWS signature');
  const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, 'ascii');
  if (!verify('RSA-SHA256', signingInput, leaf.publicKey, signature)) {
    throw new FursDomainError('FURS_JWS_SIGNATURE', 'FURS JWS signature verification failed');
  }

  const payloadJson = decodeBase64Url(encodedPayload, 'JWS payload').toString('utf8');
  const payload = parseJsonObject(payloadJson, 'JWS payload') as TPayload;
  return Object.freeze({
    protectedHeader: Object.freeze(protectedHeader),
    payload,
    payloadJson,
    signerCertificate: leaf
  });
}
