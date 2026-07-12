import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import type { IbmCounter } from '../../../../domain/models/index.js'
import { IbmCounterKeys } from '../../../../domain/models/index.js'
import type { CounterColumns, IdbCounterDrizzlePg } from './pg.schema.counter.js'

type Tbm = IbmCounter
type Tdb = IdbCounterDrizzlePg

const conversions: FieldConversionLookup<Tbm, CounterColumns> = {
  id: {
    toDomain: uuidToString,
    toDb: stringToUuid,
  },
  tenantId: {
    toDomain: uuidToString,
    toDb: stringToUuid,
  },
} satisfies FieldConversionLookup<Tbm, CounterColumns>

export const mapperCounterPg = createBmDbMapper<Tbm, Tdb, CounterColumns>(conversions, IbmCounterKeys)
