import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmWorkflowDefinition } from '../../../domain/models/index.js'
import { IdbWorkflowDefinitionDrizzle } from '../../../infrastructure/db/workflowDefinition/drizzle/drizzle.schema.workflowDefinition.js'

export interface IRepositoryPortWorkflowDefinition
  extends IRepositoryPortBaseCrud<IbmWorkflowDefinition, IdbWorkflowDefinitionDrizzle, RepositoryError> {}
