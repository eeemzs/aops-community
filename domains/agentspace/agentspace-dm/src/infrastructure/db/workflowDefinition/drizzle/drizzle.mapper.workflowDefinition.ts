import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmWorkflowDefinition } from '../../../../domain/models/index.js'
import {
  IdbWorkflowDefinitionDrizzle,
  WorkflowDefinitionColumnsDrizzle,
} from './drizzle.schema.workflowDefinition.js'

const conversions: FieldConversionLookup<IbmWorkflowDefinition, WorkflowDefinitionColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
}

export const mapperWorkflowDefinitionDrizzle = createBmDbMapper<
  IbmWorkflowDefinition,
  IdbWorkflowDefinitionDrizzle,
  WorkflowDefinitionColumnsDrizzle
>(conversions)
