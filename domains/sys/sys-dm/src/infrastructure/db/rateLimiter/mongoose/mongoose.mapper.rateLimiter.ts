import { createBmDbMapper, FieldConversionLookup } from '@aopslab/xf-db';
// import { stringToObjectId, objectIdToString } from '@xf-db/mongoose'
import { stringToObjectId, objectIdToString, stringToUuidMongoose, uuidToStringMongoose } from '@aopslab/xf-db-mongoose';
import { RateLimiterColumns, IdbRateLimiter } from './mongoose.schema.rateLimiter.js';
import { IbmRateLimiter, IbmRateLimiterKeys } from '../../../../domain/models/index.js';

type Tbm = IbmRateLimiter;
type Tdb = IdbRateLimiter;

const conversions: FieldConversionLookup<Tbm, RateLimiterColumns> = {
  id: {
    dbKey: '_id',
    toDb: stringToObjectId,
    toDomain: objectIdToString
  },
  // v: { dbKey: '__v' },
  tenantId: {
    // dbKey: 'tenantId', // Same name in domain and db
    toDomain: uuidToStringMongoose,
    toDb: stringToUuidMongoose
  }
} satisfies FieldConversionLookup<Tbm, RateLimiterColumns>;

export const mapperRateLimiterMongoose = createBmDbMapper<Tbm, Tdb, RateLimiterColumns>(conversions, IbmRateLimiterKeys);
