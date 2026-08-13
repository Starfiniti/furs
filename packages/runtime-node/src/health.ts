import { FursDomainError, type CertificateMetadata } from '@starfiniti/furs-core';

import type { NtpClockObservation } from './sntp.js';

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

  public observeClock(observation: NtpClockObservation): void {
    if (!Number.isSafeInteger(observation.clockDriftMs) || !Number.isFinite(observation.observedAt.getTime()) || observation.responseCount < 2) {
      throw new Error('NTP clock observation is invalid');
    }
    this.#clockDriftMs = observation.clockDriftMs;
    this.#observedAt = observation.observedAt;
  }

  public assertCertificateReady(now = new Date()): void {
    const remaining = this.#certificate.validTo.getTime() - now.getTime();
    if (now < this.#certificate.validFrom || remaining < this.#minimumDays * 86_400_000) throw new Error('Fiscal certificate is not within the accepted validity window');
  }

  public assertClockReady(now = new Date()): void {
    const ageMs = this.#observedAt === undefined ? undefined : now.getTime() - this.#observedAt.getTime();
    if (this.#clockDriftMs === undefined || ageMs === undefined || ageMs < -10_000 || ageMs > 300_000) {
      throw new FursDomainError('FURS_CLOCK_NOT_READY', 'NTP clock observation is missing or stale');
    }
    if (Math.abs(this.#clockDriftMs) > this.#maximumClockDriftMs) {
      throw new FursDomainError('FURS_CLOCK_NOT_READY', 'System clock drift exceeds the configured threshold');
    }
  }

  public snapshot(now = new Date()): RuntimeHealthSnapshot {
    return Object.freeze({
      certificateDaysRemaining: Math.floor((this.#certificate.validTo.getTime() - now.getTime()) / 86_400_000),
      clockDriftMs: this.#clockDriftMs,
      lastClockObservationAt: this.#observedAt?.toISOString()
    });
  }
}
