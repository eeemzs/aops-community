import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmTaskChecklistItem } from '../../../../domain/models/index.js'
import { IdbTaskChecklistItemDrizzle, TaskChecklistItemColumnsDrizzle } from './drizzle.schema.taskChecklistItem.js'

const conversions: FieldConversionLookup<IbmTaskChecklistItem, TaskChecklistItemColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperTaskChecklistItemDrizzle =
  createBmDbMapper<IbmTaskChecklistItem, IdbTaskChecklistItemDrizzle, TaskChecklistItemColumnsDrizzle>(conversions)
