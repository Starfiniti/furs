import { processFinalizedPlatformFiscalEvent, type FinalizedPlatformFiscalEvent, type FiscalGateway, type FiscalResultMetadataSink, type PlatformFiscalEventResult } from '@starfiniti/furs-service-contract';
export type MedusaEventName = 'payment.captured' | 'payment.refunded';
export interface MedusaFiscalEvent extends FinalizedPlatformFiscalEvent { readonly storeId: string; readonly orderId: string; readonly name: MedusaEventName; }
export function handleMedusaFiscalEvent(event: MedusaFiscalEvent, gateway: FiscalGateway, metadata: FiscalResultMetadataSink): Promise<PlatformFiscalEventResult> {
  if (!['payment.captured', 'payment.refunded'].includes(event.name)) throw new Error('Unsupported Medusa fiscal event');
  return processFinalizedPlatformFiscalEvent('medusa', { ...event, aggregateId: `${event.storeId}:${event.orderId}` }, gateway, metadata);
}
