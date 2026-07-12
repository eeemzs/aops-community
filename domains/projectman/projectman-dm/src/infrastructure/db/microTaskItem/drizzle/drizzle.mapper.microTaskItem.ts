import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmMicroTaskItem } from '../../../../domain/models/index.js'
import { IdbMicroTaskItemDrizzle, MicroTaskItemColumnsDrizzle } from './drizzle.schema.microTaskItem.js'

const conversions: FieldConversionLookup<IbmMicroTaskItem, MicroTaskItemColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  phaseId: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperMicroTaskItemDrizzle = createBmDbMapper<IbmMicroTaskItem, IdbMicroTaskItemDrizzle, MicroTaskItemColumnsDrizzle>(conversions);
