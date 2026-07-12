import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmTask } from '../../../../domain/models/index.js'
import { IdbTaskDrizzle, TaskColumnsDrizzle } from './drizzle.schema.task.js'

const conversions: FieldConversionLookup<IbmTask, TaskColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
};

export const mapperTaskDrizzle = createBmDbMapper<IbmTask, IdbTaskDrizzle, TaskColumnsDrizzle>(conversions);
