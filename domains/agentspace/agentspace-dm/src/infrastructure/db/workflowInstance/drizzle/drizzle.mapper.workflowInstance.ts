import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmWorkflowInstance } from '../../../../domain/models/index.js'
import { IdbWorkflowInstanceDrizzle, WorkflowInstanceColumnsDrizzle } from './drizzle.schema.workflowInstance.js'

const conversions: FieldConversionLookup<IbmWorkflowInstance, WorkflowInstanceColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperWorkflowInstanceDrizzle = createBmDbMapper<IbmWorkflowInstance, IdbWorkflowInstanceDrizzle, WorkflowInstanceColumnsDrizzle>(conversions)
