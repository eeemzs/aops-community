import { createBmDbMapper, FieldConversionLookup } from '@aopslab/xf-db';
import { stringToUuid, uuidToString } from '@aopslab/xf-db';
import { IdbRateLimiterDrizzlePg, RateLimiterColumns } from './pg.schema.rateLimiter.js';
import { IbmRateLimiter, IbmRateLimiterKeys } from '../../../../domain/models/index.js';

type Tbm = IbmRateLimiter;
type Tdb = IdbRateLimiterDrizzlePg;

// Extract database column names from the Drizzle schema
// type RateLimiterColumns = keyof typeof pgRateLimiters.$inferInsert

const conversions: FieldConversionLookup<Tbm, RateLimiterColumns> = {
  id: {
    // dbKey: 'id', // Same name in domain and db
    // toDomain: (v: any) => v?.toString().toLowerCase(),
    // toDb: (v: any) => v?.toString().toLowerCase(),
    toDomain: uuidToString,
    toDb: stringToUuid
  },
  tenantId: {
    // dbKey: 'tenantId', // Same name in domain and db
    toDomain: uuidToString,
    toDb: stringToUuid
  }
} satisfies FieldConversionLookup<Tbm, RateLimiterColumns>;

export const mapperRateLimiterPg = createBmDbMapper<Tbm, Tdb, RateLimiterColumns>(conversions, IbmRateLimiterKeys);
