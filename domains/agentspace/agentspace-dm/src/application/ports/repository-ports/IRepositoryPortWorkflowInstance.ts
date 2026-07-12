import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmWorkflowInstance } from '../../../domain/models/index.js'
import { IdbWorkflowInstanceDrizzle } from '../../../infrastructure/db/workflowInstance/drizzle/drizzle.schema.workflowInstance.js'

/**
 * Repository port for WorkflowInstance
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortWorkflowInstance extends IRepositoryPortBaseCrud<IbmWorkflowInstance, IdbWorkflowInstanceDrizzle, RepositoryError> {}
