import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmActivityItem } from '../../../../domain/models/index.js'
import { IdbActivityItemDrizzle, ActivityItemColumnsDrizzle } from './drizzle.schema.activityItem.js'

const conversions: FieldConversionLookup<IbmActivityItem, ActivityItemColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  projectId: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperActivityItemDrizzle = createBmDbMapper<IbmActivityItem, IdbActivityItemDrizzle, ActivityItemColumnsDrizzle>(conversions)
