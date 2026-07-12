import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmTag } from '../../../../domain/models/index.js'
import { IdbTagDrizzle, TagColumnsDrizzle } from './drizzle.schema.tag.js'

const conversions: FieldConversionLookup<IbmTag, TagColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperTagDrizzle = createBmDbMapper<IbmTag, IdbTagDrizzle, TagColumnsDrizzle>(conversions);
