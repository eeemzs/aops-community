import { createBmDbMapper, FieldConversionLookup } from '@aopslab/xf-db'
import type { IbmCounter } from '../../../../domain/models/index.js'
import { IbmCounterKeys } from '../../../../domain/models/index.js'
import type { IdbCounter } from './mongoose.schema.counter.js'

type Tbm = IbmCounter
type Tdb = IdbCounter

const conversions: FieldConversionLookup<Tbm, keyof IdbCounter> = {
  id: {
    dbKey: '_id' as keyof IdbCounter,
    toDomain: (value: unknown) => (value ? String(value) : undefined),
    toDb: (value: unknown) => value,
  },
} satisfies FieldConversionLookup<Tbm, keyof IdbCounter>

export const mapperCounterMongoose = createBmDbMapper<Tbm, Tdb, keyof IdbCounter>(conversions, IbmCounterKeys)
