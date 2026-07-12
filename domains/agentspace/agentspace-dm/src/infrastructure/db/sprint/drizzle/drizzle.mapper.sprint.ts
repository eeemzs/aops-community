import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmSprint } from '../../../../domain/models/index.js'
import { IdbSprintDrizzle, SprintColumnsDrizzle } from './drizzle.schema.sprint.js'

const conversions: FieldConversionLookup<IbmSprint, SprintColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperSprintDrizzle = createBmDbMapper<IbmSprint, IdbSprintDrizzle, SprintColumnsDrizzle>(conversions);
