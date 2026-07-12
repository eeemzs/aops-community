import { Effect } from 'effect'
import { PlanningLineageServiceError } from '../../errors/PlanningLineageServiceError.js'
import { IbmPlanningLineage, IbmPlanningLineageInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export type PlanningLineageRecordCopyInput = {
  scopeId: string
  projectId: string
  sourceType: string
  sourceId: string
  targetType: string
  targetId: string
  copyDepth: 'shallow' | 'deep'
  sourceProjectId?: string | null
  targetProjectId?: string | null
  details?: unknown
  createdBy?: string
}

export interface IPlanningLineageServicePort {
  getById(id: string, options?: DbQueryOptions<IbmPlanningLineage>): Effect.Effect<IbmPlanningLineage | null, PlanningLineageServiceError>
  create(data: IbmPlanningLineageInsert): Effect.Effect<IbmPlanningLineage, PlanningLineageServiceError>
  listLineages(
    filter?: Partial<IbmPlanningLineage>,
    options?: DbQueryOptions<IbmPlanningLineage>
  ): Effect.Effect<IbmPlanningLineage[], PlanningLineageServiceError>
  recordCopyLineage(input: PlanningLineageRecordCopyInput): Effect.Effect<IbmPlanningLineage, PlanningLineageServiceError>
}

export interface IPlanningLineageLookupPort {
  getById(id: string): Effect.Effect<IbmPlanningLineage | null, PlanningLineageServiceError>
}
