import { createSocket } from 'node:dgram';

const NTP_PORT = 123;
const NTP_PACKET_BYTES = 48;
const NTP_UNIX_EPOCH_SECONDS = 2_208_988_800;
const NTP_ERA_MILLISECONDS = 2 ** 32 * 1_000;

export interface SntpSample {
  readonly server: string;
  readonly clockDriftMs: number;
  readonly roundTripMs: number;
  readonly observedAt: Date;
}

export interface NtpClockObservation {
  readonly clockDriftMs: number;
  readonly observedAt: Date;
  readonly responseCount: number;
  readonly maximumRoundTripMs: number;
}

export interface NtpClockOptions {
  readonly servers: readonly string[];
  readonly minimumResponses: number;
  readonly timeoutMs: number;
  readonly maximumRoundTripMs?: number;
  readonly maximumClockSpreadMs?: number;
  readonly query?: (server: string, timeoutMs: number, maximumRoundTripMs: number) => Promise<SntpSample>;
}

function writeTimestamp(target: Buffer, offset: number, unixMilliseconds: number): void {
  const seconds = Math.floor(unixMilliseconds / 1_000) + NTP_UNIX_EPOCH_SECONDS;
  const milliseconds = unixMilliseconds - Math.floor(unixMilliseconds / 1_000) * 1_000;
  target.writeUInt32BE(seconds >>> 0, offset);
  target.writeUInt32BE(Math.floor(milliseconds / 1_000 * 2 ** 32), offset + 4);
}

function readTimestamp(source: Buffer, offset: number, referenceUnixMilliseconds: number): number {
  const seconds = source.readUInt32BE(offset);
  const fraction = source.readUInt32BE(offset + 4);
  let unixMilliseconds = (seconds - NTP_UNIX_EPOCH_SECONDS) * 1_000 + fraction / 2 ** 32 * 1_000;
  while (unixMilliseconds - referenceUnixMilliseconds > NTP_ERA_MILLISECONDS / 2) unixMilliseconds -= NTP_ERA_MILLISECONDS;
  while (referenceUnixMilliseconds - unixMilliseconds > NTP_ERA_MILLISECONDS / 2) unixMilliseconds += NTP_ERA_MILLISECONDS;
  return unixMilliseconds;
}

export function createSntpRequest(requestStartedAt: Date): Buffer {
  const request = Buffer.alloc(NTP_PACKET_BYTES);
  request[0] = 0x23; // LI=0, VN=4, mode=3 (client)
  writeTimestamp(request, 40, requestStartedAt.getTime());
  return request;
}

export function parseSntpResponse(
  server: string,
  request: Buffer,
  requestStartedAt: Date,
  response: Buffer,
  observedAt: Date,
  maximumRoundTripMs: number
): SntpSample {
  if (response.length < NTP_PACKET_BYTES) throw new Error('NTP response is truncated');
  const leapIndicator = response[0]! >> 6;
  const version = (response[0]! >> 3) & 0x07;
  const mode = response[0]! & 0x07;
  const stratum = response[1]!;
  if (leapIndicator === 3) throw new Error('NTP server reports an unsynchronized clock');
  if ((version !== 3 && version !== 4) || mode !== 4) throw new Error('NTP response protocol fields are invalid');
  if (stratum < 1 || stratum > 15) throw new Error('NTP response stratum is not usable');
  if (!response.subarray(24, 32).equals(request.subarray(40, 48))) {
    throw new Error('NTP response does not correlate to the request');
  }
  if (response.subarray(32, 40).equals(Buffer.alloc(8)) || response.subarray(40, 48).equals(Buffer.alloc(8))) {
    throw new Error('NTP response has a missing server timestamp');
  }

  const t1 = requestStartedAt.getTime();
  const t4 = observedAt.getTime();
  const t2 = readTimestamp(response, 32, t4);
  const t3 = readTimestamp(response, 40, t4);
  const roundTripMs = (t4 - t1) - (t3 - t2);
  if (!Number.isFinite(roundTripMs) || roundTripMs < -2 || roundTripMs > maximumRoundTripMs) {
    throw new Error('NTP response round trip is outside the accepted bound');
  }
  const serverMinusLocalMs = ((t2 - t1) + (t3 - t4)) / 2;
  return Object.freeze({
    server,
    clockDriftMs: Math.round(-serverMinusLocalMs),
    roundTripMs: Math.max(0, Math.round(roundTripMs)),
    observedAt: new Date(t4)
  });
}

export async function querySntpServer(server: string, timeoutMs: number, maximumRoundTripMs: number): Promise<SntpSample> {
  const socket = createSocket('udp4');
  const requestStartedAt = new Date();
  const request = createSntpRequest(requestStartedAt);
  return new Promise<SntpSample>((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | undefined, sample?: SntpSample): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* socket may not have bound before a DNS failure */ }
      if (error !== undefined) reject(error);
      else resolve(sample!);
    };
    const timer = setTimeout(() => finish(new Error('NTP request timed out')), timeoutMs);
    socket.once('error', () => finish(new Error('NTP request failed')));
    socket.once('message', (response) => {
      try {
        finish(undefined, parseSntpResponse(server, request, requestStartedAt, response, new Date(), maximumRoundTripMs));
      } catch (error) {
        finish(error instanceof Error ? error : new Error('NTP response validation failed'));
      }
    });
    socket.connect(NTP_PORT, server, () => {
      socket.send(request, (error) => { if (error !== null) finish(new Error('NTP request failed')); });
    });
  });
}

export async function observeNtpClock(options: NtpClockOptions): Promise<NtpClockObservation> {
  const servers = [...new Set(options.servers)];
  if (servers.length !== options.servers.length || servers.length < 2) throw new Error('At least two distinct NTP servers are required');
  if (!Number.isSafeInteger(options.minimumResponses) || options.minimumResponses < 2 || options.minimumResponses > servers.length) {
    throw new Error('NTP response quorum is invalid');
  }
  const maximumRoundTripMs = options.maximumRoundTripMs ?? options.timeoutMs;
  const maximumClockSpreadMs = options.maximumClockSpreadMs ?? 5_000;
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || !Number.isSafeInteger(maximumRoundTripMs) || maximumRoundTripMs < 1) {
    throw new Error('NTP timeout bounds are invalid');
  }
  if (!Number.isSafeInteger(maximumClockSpreadMs) || maximumClockSpreadMs < 1) throw new Error('NTP clock spread bound is invalid');
  const query = options.query ?? querySntpServer;
  const settled = await Promise.allSettled(servers.map((server) => query(server, options.timeoutMs, maximumRoundTripMs)));
  const samples = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (samples.length < options.minimumResponses) throw new Error('NTP response quorum was not reached');
  if (samples.some((sample) => !Number.isSafeInteger(sample.clockDriftMs) || !Number.isSafeInteger(sample.roundTripMs) || !Number.isFinite(sample.observedAt.getTime()))) {
    throw new Error('NTP response quorum contains an invalid observation');
  }
  const sortedDrifts = samples.map((sample) => sample.clockDriftMs).sort((left, right) => left - right);
  if (sortedDrifts.at(-1)! - sortedDrifts[0]! > maximumClockSpreadMs) throw new Error('NTP servers do not agree within the accepted bound');
  const middle = Math.floor(sortedDrifts.length / 2);
  const clockDriftMs = sortedDrifts.length % 2 === 1
    ? sortedDrifts[middle]!
    : Math.round((sortedDrifts[middle - 1]! + sortedDrifts[middle]!) / 2);
  return Object.freeze({
    clockDriftMs,
    observedAt: new Date(Math.max(...samples.map((sample) => sample.observedAt.getTime()))),
    responseCount: samples.length,
    maximumRoundTripMs: Math.max(...samples.map((sample) => sample.roundTripMs))
  });
}
