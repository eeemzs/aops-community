import { Effect } from 'effect'
import { WorkflowInstanceServiceError } from '../../errors/WorkflowInstanceServiceError.js'
import { IbmWorkflowInstance, IbmWorkflowInstanceInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { ScopeResolution } from '../../../domain/types.js'

export interface WorkflowInstanceListFilter {
  scopeId?: string
  scopeResolution?: ScopeResolution
  workflowInstanceId?: string
  definitionId?: string
  mode?: string
  status?: string
  subjectType?: string
  subjectId?: string
  runtimeProfile?: string
  activeApprovalId?: string
}

export interface IWorkflowInstanceServicePort {
  getById(id: string, options?: DbQueryOptions<IbmWorkflowInstance>): Effect.Effect<IbmWorkflowInstance | null, WorkflowInstanceServiceError>
  create(data: IbmWorkflowInstanceInsert): Effect.Effect<IbmWorkflowInstance, WorkflowInstanceServiceError>
  listWorkflowInstances(
    filter?: WorkflowInstanceListFilter,
    options?: DbQueryOptions<IbmWorkflowInstance>
  ): Effect.Effect<IbmWorkflowInstance[], WorkflowInstanceServiceError>
}

export interface IWorkflowInstanceLookupPort {
  getById(id: string): Effect.Effect<IbmWorkflowInstance | null, WorkflowInstanceServiceError>
}
