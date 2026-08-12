import type { CertificateMetadata, FursEchoObservation } from '@starfiniti/furs-core';

export interface RuntimeHealthSnapshot {
  readonly certificateDaysRemaining: number;
  readonly clockDriftMs: number | undefined;
  readonly lastClockObservationAt: string | undefined;
}

export class RuntimeHealthMonitor {
  readonly #certificate: CertificateMetadata;
  readonly #maximumClockDriftMs: number;
  readonly #minimumDays: number;
  #clockDriftMs: number | undefined;
  #observedAt: Date | undefined;

  public constructor(certificate: CertificateMetadata, maximumClockDriftMs: number, minimumDays: number) {
    this.#certificate = certificate; this.#maximumClockDriftMs = maximumClockDriftMs; this.#minimumDays = minimumDays;
  }

  public observeEcho(observation: FursEchoObservation, requestStartedAt: Date): void {
    if (observation.serverDate === undefined) throw new Error('FURS echo response has no Date header for clock monitoring');
    const remote = Date.parse(observation.serverDate);
    if (!Number.isFinite(remote)) throw new Error('FURS echo Date header is invalid');
    const midpoint = (requestStartedAt.getTime() + observation.observedAt.getTime()) / 2;
    this.#clockDriftMs = Math.round(midpoint - remote);
    this.#observedAt = observation.observedAt;
  }

  public assertCertificateReady(now = new Date()): void {
    const remaining = this.#certificate.validTo.getTime() - now.getTime();
    if (now < this.#certificate.validFrom || remaining < this.#minimumDays * 86_400_000) throw new Error('Fiscal certificate is not within the accepted validity window');
  }

  public assertClockReady(now = new Date()): void {
    if (this.#clockDriftMs === undefined || this.#observedAt === undefined || now.getTime() - this.#observedAt.getTime() > 300_000) {
      throw new Error('FURS clock observation is missing or stale');
    }
    if (Math.abs(this.#clockDriftMs) > this.#maximumClockDriftMs) throw new Error('System clock drift exceeds the configured threshold');
  }

  public snapshot(now = new Date()): RuntimeHealthSnapshot {
    return Object.freeze({
      certificateDaysRemaining: Math.floor((this.#certificate.validTo.getTime() - now.getTime()) / 86_400_000),
      clockDriftMs: this.#clockDriftMs,
      lastClockObservationAt: this.#observedAt?.toISOString()
    });
  }
}
