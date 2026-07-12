import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmSprintItem } from '../../../../domain/models/index.js'
import { IdbSprintItemDrizzle, SprintItemColumnsDrizzle } from './drizzle.schema.sprintItem.js'

const conversions: FieldConversionLookup<IbmSprintItem, SprintItemColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperSprintItemDrizzle = createBmDbMapper<IbmSprintItem, IdbSprintItemDrizzle, SprintItemColumnsDrizzle>(conversions);
