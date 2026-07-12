import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmWorkflowStepRun } from '../../../domain/models/index.js'
import { IdbWorkflowStepRunDrizzle } from '../../../infrastructure/db/workflowStepRun/drizzle/drizzle.schema.workflowStepRun.js'

/**
 * Repository port for WorkflowStepRun
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortWorkflowStepRun extends IRepositoryPortBaseCrud<IbmWorkflowStepRun, IdbWorkflowStepRunDrizzle, RepositoryError> {}
