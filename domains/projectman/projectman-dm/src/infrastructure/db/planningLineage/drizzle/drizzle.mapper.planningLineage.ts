import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmPlanningLineage } from '../../../../domain/models/index.js'
import { IdbPlanningLineageDrizzle, PlanningLineageColumnsDrizzle } from './drizzle.schema.planningLineage.js'

const conversions: FieldConversionLookup<IbmPlanningLineage, PlanningLineageColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  scopeId: { toDomain: uuidToString, toDb: stringToUuid },
  projectId: { toDomain: uuidToString, toDb: stringToUuid },
  sourceProjectId: { toDomain: uuidToString, toDb: stringToUuid },
  targetProjectId: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperPlanningLineageDrizzle = createBmDbMapper<IbmPlanningLineage, IdbPlanningLineageDrizzle, PlanningLineageColumnsDrizzle>(conversions)
