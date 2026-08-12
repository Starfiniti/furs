import {
  processFinalizedPlatformFiscalEvent,
  type FinalizedPlatformFiscalEvent,
  type FiscalGateway,
  type FiscalResultMetadataSink,
  type PlatformFiscalEventResult
} from '@starfiniti/furs-service-contract';

export interface NextjsFiscalEvent extends FinalizedPlatformFiscalEvent {
  readonly applicationId: string;
}

export function handleNextjsFiscalEvent(
  event: NextjsFiscalEvent,
  gateway: FiscalGateway,
  metadata: FiscalResultMetadataSink
): Promise<PlatformFiscalEventResult> {
  return processFinalizedPlatformFiscalEvent(
    'nextjs', { ...event, aggregateId: `${event.applicationId}:${event.aggregateId}` }, gateway, metadata
  );
}
