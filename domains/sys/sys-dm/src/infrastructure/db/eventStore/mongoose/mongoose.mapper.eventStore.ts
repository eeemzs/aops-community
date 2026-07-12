import { createBmDbMapper, FieldConversionLookup } from '@aopslab/xf-db';
import { stringToObjectId, objectIdToString, stringToUuidMongoose, uuidToStringMongoose } from '@aopslab/xf-db-mongoose';
import { EventStoreColumns, IdbEventStore } from './mongoose.schema.eventStore.js';
import { IbmEventStore } from '../../../../domain/models/index.js';

type Tbm = IbmEventStore;
type Tdb = IdbEventStore;

const conversions: FieldConversionLookup<Tbm, EventStoreColumns> = {
  id: {
    dbKey: '_id',
    toDb: stringToObjectId,
    toDomain: objectIdToString
  },
  eventId: {
    toDomain: uuidToStringMongoose,
    toDb: stringToUuidMongoose
  },
  tenantId: {
    // dbKey: 'tenantId', // Same name in domain and db
    toDomain: uuidToStringMongoose,
    toDb: stringToUuidMongoose
  }
  // All other fields (eventType, aggregateId, aggregateType, payload, etc.)
  // are directly compatible between domain and DB models
} satisfies FieldConversionLookup<Tbm, EventStoreColumns>;

// Minimal Event Store Keys - updated for simplified model
const IbmEventStoreKeys: (keyof IbmEventStore)[] = [
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'eventType',
  'aggregateId',
  'eventData',
  'version',
  'occurredAt'
];

export const mapperEventStoreMongoose = createBmDbMapper<Tbm, Tdb, EventStoreColumns>(conversions, IbmEventStoreKeys as any);
