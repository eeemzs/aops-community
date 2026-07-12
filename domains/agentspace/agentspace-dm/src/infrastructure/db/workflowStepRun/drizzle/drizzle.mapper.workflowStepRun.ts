import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmWorkflowStepRun } from '../../../../domain/models/index.js'
import { IdbWorkflowStepRunDrizzle, WorkflowStepRunColumnsDrizzle } from './drizzle.schema.workflowStepRun.js'

const conversions: FieldConversionLookup<IbmWorkflowStepRun, WorkflowStepRunColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperWorkflowStepRunDrizzle = createBmDbMapper<IbmWorkflowStepRun, IdbWorkflowStepRunDrizzle, WorkflowStepRunColumnsDrizzle>(conversions)
