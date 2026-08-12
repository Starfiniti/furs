export class ApiMetrics {
  #accepted = 0;
  #errors = 0;
  #requests = 0;

  public request(): void { this.#requests += 1; }
  public accepted(): void { this.#accepted += 1; }
  public error(): void { this.#errors += 1; }

  public render(): string {
    return [
      '# TYPE starfiniti_furs_api_requests_total counter',
      `starfiniti_furs_api_requests_total ${this.#requests}`,
      '# TYPE starfiniti_furs_api_fiscal_accepted_total counter',
      `starfiniti_furs_api_fiscal_accepted_total ${this.#accepted}`,
      '# TYPE starfiniti_furs_api_errors_total counter',
      `starfiniti_furs_api_errors_total ${this.#errors}`,
      ''
    ].join('\n');
  }
}

export function renderOperationalMetrics(input: {
  readonly documentsByStatus: Readonly<Record<string, number>>;
  readonly activeOutboxJobs: number;
  readonly oldestActiveOutboxAt: string | undefined;
  readonly oldestUnconfirmedAt: string | undefined;
  readonly certificateDaysRemaining: number | undefined;
  readonly clockDriftMs: number | undefined;
  readonly workerLastSeenAt: string | undefined;
}, now = new Date()): string {
  const lines = ['# TYPE starfiniti_furs_documents gauge'];
  for (const [status, count] of Object.entries(input.documentsByStatus).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`starfiniti_furs_documents{status="${status}"} ${count}`);
  }
  const age = (value: string | undefined) => value === undefined ? 0 : Math.max(0, (now.getTime() - Date.parse(value)) / 1000);
  lines.push('# TYPE starfiniti_furs_outbox_active gauge', `starfiniti_furs_outbox_active ${input.activeOutboxJobs}`);
  lines.push('# TYPE starfiniti_furs_outbox_oldest_age_seconds gauge', `starfiniti_furs_outbox_oldest_age_seconds ${age(input.oldestActiveOutboxAt)}`);
  lines.push('# TYPE starfiniti_furs_unconfirmed_oldest_age_seconds gauge', `starfiniti_furs_unconfirmed_oldest_age_seconds ${age(input.oldestUnconfirmedAt)}`);
  lines.push('# TYPE starfiniti_furs_worker_heartbeat_age_seconds gauge', `starfiniti_furs_worker_heartbeat_age_seconds ${input.workerLastSeenAt === undefined ? -1 : age(input.workerLastSeenAt)}`);
  if (input.certificateDaysRemaining !== undefined) lines.push('# TYPE starfiniti_furs_certificate_days_remaining gauge', `starfiniti_furs_certificate_days_remaining ${input.certificateDaysRemaining}`);
  if (input.clockDriftMs !== undefined) lines.push('# TYPE starfiniti_furs_clock_drift_milliseconds gauge', `starfiniti_furs_clock_drift_milliseconds ${input.clockDriftMs}`);
  lines.push('');
  return lines.join('\n');
}
