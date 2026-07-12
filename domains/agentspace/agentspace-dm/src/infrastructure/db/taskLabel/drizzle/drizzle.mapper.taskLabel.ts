import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmTaskLabel } from '../../../../domain/models/index.js'
import { IdbTaskLabelDrizzle, TaskLabelColumnsDrizzle } from './drizzle.schema.taskLabel.js'

const conversions: FieldConversionLookup<IbmTaskLabel, TaskLabelColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperTaskLabelDrizzle =
  createBmDbMapper<IbmTaskLabel, IdbTaskLabelDrizzle, TaskLabelColumnsDrizzle>(conversions)
