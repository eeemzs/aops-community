import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmProjectmanEvent } from '../../../../domain/models/index.js'
import { IdbProjectmanEventDrizzle, ProjectmanEventColumnsDrizzle } from './drizzle.schema.projectmanEvent.js'

const conversions: FieldConversionLookup<IbmProjectmanEvent, ProjectmanEventColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperProjectmanEventDrizzle = createBmDbMapper<IbmProjectmanEvent, IdbProjectmanEventDrizzle, ProjectmanEventColumnsDrizzle>(conversions);
