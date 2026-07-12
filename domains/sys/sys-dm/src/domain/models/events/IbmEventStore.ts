import { Ibm } from '@aopslab/xf-bm';

export interface IbmEventStore extends Ibm {
  // Minimal Database Event Store Model - Basit ve yeterli alanlar
  eventId: string; // Event ID UUID
  eventType: string; // Event türü (örn: 'UserCreated', 'OrderPlaced')
  aggregateId: string; // Hangi entity ile ilgili (örn: userId, orderId)
  eventData: string; // JSON string olarak event verisi
  occurredAt: Date; // Event ne zaman oldu
  version: number; // Event versiyonu (sıralama için)
}

export const IbmEventStoreKeys = [
  'id',
  'eventId',
  'eventType',
  'aggregateId',
  'eventData',
  'occurredAt',
  'version'
] as const satisfies readonly (keyof IbmEventStore)[];

export type IbmEventStoreKeysType = (typeof IbmEventStoreKeys)[number];
