import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmTaskRelation } from '../../../../domain/models/index.js'
import { IdbTaskRelationDrizzle, TaskRelationColumnsDrizzle } from './drizzle.schema.taskRelation.js'

const conversions: FieldConversionLookup<IbmTaskRelation, TaskRelationColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperTaskRelationDrizzle =
  createBmDbMapper<IbmTaskRelation, IdbTaskRelationDrizzle, TaskRelationColumnsDrizzle>(conversions)
