import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmSprintGroup } from '../../../../domain/models/index.js'
import { IdbSprintGroupDrizzle, SprintGroupColumnsDrizzle } from './drizzle.schema.sprintGroup.js'

const conversions: FieldConversionLookup<IbmSprintGroup, SprintGroupColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  sprintId: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperSprintGroupDrizzle = createBmDbMapper<IbmSprintGroup, IdbSprintGroupDrizzle, SprintGroupColumnsDrizzle>(conversions);
