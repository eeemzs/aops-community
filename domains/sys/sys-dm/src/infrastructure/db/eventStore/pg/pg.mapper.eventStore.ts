import { createBmDbMapper, FieldConversionLookup } from '@aopslab/xf-db';
import { stringToUuid, uuidToString } from '@aopslab/xf-db';
import { IbmEventStore } from '../../../../domain/models/index.js';
import { IdbEventStoreDrizzlePg, EventStoreColumns } from './pg.schema.eventStore.js';

type Tbm = IbmEventStore;
type Tdb = IdbEventStoreDrizzlePg;

const conversions: FieldConversionLookup<Tbm, EventStoreColumns> = {
  id: {
    // dbKey: 'id', // Same name in domain and db
    toDomain: uuidToString,
    toDb: stringToUuid
  },
  eventId: {
    toDomain: uuidToString,
    toDb: stringToUuid
  },
  tenantId: {
    // dbKey: 'tenantId', // Same name in domain and db
    toDomain: uuidToString,
    toDb: stringToUuid
  }

  // All other fields (eventType, aggregateId, eventData, version, occurredAt)
  // are directly compatible between domain and DB models
} satisfies FieldConversionLookup<Tbm, EventStoreColumns>;

export const mapperEventStorePg = createBmDbMapper<Tbm, Tdb, EventStoreColumns>(conversions);
