import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createVerify,
  sign,
  X509Certificate,
  type KeyObject
} from 'node:crypto';
import { createSecureContext, type SecureContext } from 'node:tls';

import forge from 'node-forge';

import { FursDomainError } from './domain-error.js';

export interface CertificateMetadata {
  readonly subjectName: string;
  readonly issuerName: string;
  readonly serialNumberDecimal: string;
  readonly fingerprint256: string;
  readonly validFrom: Date;
  readonly validTo: Date;
}

export interface FiscalSigner {
  getCertificateMetadata(): CertificateMetadata;
  signRsaSha256(data: Uint8Array): Promise<Uint8Array>;
}

export interface PemFiscalSignerInput {
  readonly privateKeyPem: string | Buffer;
  readonly certificatePem: string | Buffer;
  readonly certificateChainPem?: readonly (string | Buffer)[];
  readonly now?: Date;
}

function escapeRfc2253Value(value: string): string {
  let escaped = value.replace(/([,+"\\<>;])/g, '\\$1');
  if (escaped.startsWith('#') || escaped.startsWith(' ')) {
    escaped = `\\${escaped}`;
  }
  if (escaped.endsWith(' ')) {
    escaped = `${escaped.slice(0, -1)}\\ `;
  }
  return escaped;
}

function distinguishedNameForHeader(multilineName: string): string {
  return multilineName
    .split('\n')
    .filter(Boolean)
    .reverse()
    .map((attribute) => {
      const equalsIndex = attribute.indexOf('=');
      if (equalsIndex <= 0) {
        throw new FursDomainError('FURS_CERT_DN', 'Certificate distinguished name is malformed');
      }
      return `${attribute.slice(0, equalsIndex)}=${escapeRfc2253Value(attribute.slice(equalsIndex + 1))}`;
    })
    .join(',');
}

function certificateMetadata(certificate: X509Certificate): CertificateMetadata {
  const validFrom = new Date(certificate.validFrom);
  const validTo = new Date(certificate.validTo);
  const serialNumberDecimal = BigInt(`0x${certificate.serialNumber}`).toString(10);

  return Object.freeze({
    subjectName: distinguishedNameForHeader(certificate.subject),
    issuerName: distinguishedNameForHeader(certificate.issuer),
    serialNumberDecimal,
    fingerprint256: certificate.fingerprint256.toLowerCase(),
    validFrom,
    validTo
  });
}

function assertCertificateValidity(certificate: X509Certificate, now: Date): void {
  const timestamp = now.getTime();
  const validFrom = Date.parse(certificate.validFrom);
  const validTo = Date.parse(certificate.validTo);
  if (!Number.isFinite(timestamp) || timestamp < validFrom || timestamp > validTo) {
    throw new FursDomainError('FURS_CERT_VALIDITY', 'Fiscal certificate is not currently valid');
  }
}

function assertRsaKeyMatchesCertificate(privateKey: KeyObject, certificate: X509Certificate): void {
  if (privateKey.asymmetricKeyType !== 'rsa' || certificate.publicKey.asymmetricKeyType !== 'rsa') {
    throw new FursDomainError('FURS_CERT_KEY_TYPE', 'Fiscal certificate and private key must use RSA');
  }

  const challenge = Buffer.from('starfiniti-furs-key-match-v1', 'utf8');
  const signature = sign('RSA-SHA256', challenge, privateKey);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(challenge);
  verifier.end();
  if (!verifier.verify(certificate.publicKey, signature)) {
    throw new FursDomainError('FURS_CERT_KEY_MISMATCH', 'Private key does not match fiscal certificate');
  }
}

function orderCertificateChain(leaf: X509Certificate, certificates: readonly X509Certificate[]): X509Certificate[] {
  const remaining = [...certificates].filter(
    (certificate) => !certificate.raw.equals(leaf.raw)
  );
  const ordered = [leaf];
  let current = leaf;

  while (remaining.length > 0) {
    const nextIndex = remaining.findIndex(
      (candidate) => current.issuer === candidate.subject && current.verify(candidate.publicKey)
    );
    if (nextIndex < 0) break;
    const [next] = remaining.splice(nextIndex, 1);
    if (next === undefined) break;
    ordered.push(next);
    current = next;
  }

  return ordered;
}

export class SoftwareFiscalSigner implements FiscalSigner {
  readonly #privateKey: KeyObject;
  readonly #privateKeyPem: string;
  readonly #certificate: X509Certificate;
  readonly #certificateChain: readonly X509Certificate[];
  readonly #metadata: CertificateMetadata;

  private constructor(
    privateKey: KeyObject,
    certificate: X509Certificate,
    certificateChain: readonly X509Certificate[],
    now: Date
  ) {
    assertCertificateValidity(certificate, now);
    assertRsaKeyMatchesCertificate(privateKey, certificate);
    this.#privateKey = privateKey;
    this.#privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    this.#certificate = certificate;
    this.#certificateChain = Object.freeze([...certificateChain]);
    this.#metadata = certificateMetadata(certificate);
    Object.freeze(this);
  }

  public static fromPem(input: PemFiscalSignerInput): SoftwareFiscalSigner {
    const privateKey = createPrivateKey(input.privateKeyPem);
    const certificate = new X509Certificate(input.certificatePem);
    const additionalCertificates = (input.certificateChainPem ?? []).map(
      (pem) => new X509Certificate(pem)
    );
    const ordered = orderCertificateChain(certificate, additionalCertificates);
    return new SoftwareFiscalSigner(privateKey, certificate, ordered, input.now ?? new Date());
  }

  public static fromPkcs12(
    pkcs12Bytes: Uint8Array,
    passphrase: string,
    options: { readonly now?: Date } = {}
  ): SoftwareFiscalSigner {
    if (!(pkcs12Bytes instanceof Uint8Array) || pkcs12Bytes.byteLength === 0) {
      throw new FursDomainError('FURS_P12_BYTES', 'PKCS#12 input must be a non-empty byte array');
    }
    if (typeof passphrase !== 'string') {
      throw new FursDomainError('FURS_P12_PASSPHRASE', 'PKCS#12 passphrase must be a string');
    }

    const copy = Buffer.from(pkcs12Bytes);
    try {
      const asn1 = forge.asn1.fromDer(copy.toString('binary'));
      const container = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
      const shroudedKeyBagOid = forge.pki.oids['pkcs8ShroudedKeyBag'];
      const keyBagOid = forge.pki.oids['keyBag'];
      const certBagOid = forge.pki.oids['certBag'];
      if (!shroudedKeyBagOid || !keyBagOid || !certBagOid) {
        throw new FursDomainError('FURS_P12_OID', 'PKCS#12 object identifiers are unavailable');
      }
      const shrouded = container.getBags({
        bagType: shroudedKeyBagOid
      })[shroudedKeyBagOid] ?? [];
      const plain = container.getBags({ bagType: keyBagOid })[keyBagOid] ?? [];
      const keyBag = [...shrouded, ...plain].find((bag) => bag.key !== undefined);
      if (!keyBag?.key) {
        throw new FursDomainError('FURS_P12_PRIVATE_KEY', 'PKCS#12 does not contain a private key');
      }

      const certBags = container.getBags({ bagType: certBagOid })[certBagOid] ?? [];
      const certificatePems = certBags
        .filter((bag) => bag.cert !== undefined)
        .map((bag) => forge.pki.certificateToPem(bag.cert as forge.pki.Certificate));
      if (certificatePems.length === 0) {
        throw new FursDomainError('FURS_P12_CERTIFICATE', 'PKCS#12 does not contain a certificate');
      }

      const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
      const privateKey = createPrivateKey(privateKeyPem);
      const matchingCertificate = certificatePems
        .map((pem) => new X509Certificate(pem))
        .find((certificate) => {
          try {
            assertRsaKeyMatchesCertificate(privateKey, certificate);
            return true;
          } catch {
            return false;
          }
        });
      if (!matchingCertificate) {
        throw new FursDomainError(
          'FURS_P12_KEY_MISMATCH',
          'PKCS#12 contains no certificate matching its private key'
        );
      }

      const allCertificates = certificatePems.map((pem) => new X509Certificate(pem));
      const ordered = orderCertificateChain(matchingCertificate, allCertificates);
      return new SoftwareFiscalSigner(
        privateKey,
        matchingCertificate,
        ordered,
        options.now ?? new Date()
      );
    } catch (error) {
      if (error instanceof FursDomainError) throw error;
      throw new FursDomainError('FURS_P12_PARSE', 'Unable to parse PKCS#12 certificate container');
    } finally {
      copy.fill(0);
    }
  }

  public getCertificateMetadata(): CertificateMetadata {
    return this.#metadata;
  }

  public getCertificate(): X509Certificate {
    return this.#certificate;
  }

  public getCertificateChain(): readonly X509Certificate[] {
    return this.#certificateChain;
  }

  public createMtlsSecureContext(serverTrustAnchors: readonly (string | Buffer)[]): SecureContext {
    if (serverTrustAnchors.length === 0) {
      throw new FursDomainError('FURS_TLS_TRUST', 'At least one server trust anchor is required');
    }

    const peerChain = this.#certificateChain.filter(
      (certificate, index) =>
        index === 0 ||
        !(certificate.ca && certificate.subject === certificate.issuer && certificate.verify(certificate.publicKey))
    );

    return createSecureContext({
      key: this.#privateKeyPem,
      cert: peerChain.map((certificate) => certificate.toString()).join('\n'),
      ca: [...serverTrustAnchors],
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3'
    });
  }

  public async signRsaSha256(data: Uint8Array): Promise<Uint8Array> {
    return sign('RSA-SHA256', Buffer.from(data), this.#privateKey);
  }

  public publicKeyFingerprintSha256(): string {
    const publicKeyDer = createPublicKey(this.#privateKey).export({ type: 'spki', format: 'der' });
    return createHash('sha256').update(publicKeyDer).digest('hex');
  }
}
