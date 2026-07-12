import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmMemoryItem } from '../../../../domain/models/index.js'
import { IdbMemoryItemDrizzle, MemoryItemColumnsDrizzle } from './drizzle.schema.memoryItem.js'

const conversions: FieldConversionLookup<IbmMemoryItem, MemoryItemColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperMemoryItemDrizzle = createBmDbMapper<IbmMemoryItem, IdbMemoryItemDrizzle, MemoryItemColumnsDrizzle>(conversions);
