import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

import type { IRepositoryPortScope, IRepositoryPortWorkflowDefinition } from '../ports/repository-ports/index.js'
import type {
  IWorkflowDefinitionServicePort,
  WorkflowDefinitionListFilter,
  WorkflowDefinitionUpsertInput,
} from '../ports/inbound/index.js'
import { WorkflowDefinitionServiceError } from '../errors/WorkflowDefinitionServiceError.js'
import {
  IbmWorkflowDefinition,
  IbmWorkflowDefinitionInsert,
  workflowDefinitionZodSchemaInsert,
} from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface WorkflowDefinitionServiceDependencies {}

export interface WorkflowDefinitionServiceOptions {
  workflowDefinitionRepository: IRepositoryPortWorkflowDefinition
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<WorkflowDefinitionServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class WorkflowDefinitionService implements IWorkflowDefinitionServicePort {
  private readonly workflowDefinitionRepository: IRepositoryPortWorkflowDefinition
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: WorkflowDefinitionServiceOptions) {
    this.workflowDefinitionRepository = options.workflowDefinitionRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(
    id: string,
    options?: DbQueryOptions<IbmWorkflowDefinition>
  ): Effect.Effect<IbmWorkflowDefinition | null, WorkflowDefinitionServiceError> {
    const stage = 'WorkflowDefinitionService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((value) =>
        this.workflowDefinitionRepository.findById(value, options).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
        })
      )
    )
  }

  create(data: IbmWorkflowDefinitionInsert): Effect.Effect<IbmWorkflowDefinition, WorkflowDefinitionServiceError> {
    const stage = 'WorkflowDefinitionService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((value) =>
        validateBmInputWithSchema({
          input: value,
          schema: workflowDefinitionZodSchemaInsert,
          stage,
          operation: 'WorkflowDefinitionService::create.workflowDefinitionZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((value) =>
        this.workflowDefinitionRepository.create(value).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
        )
      )
    )
  }

  listWorkflowDefinitions(
    filter: WorkflowDefinitionListFilter = {},
    options?: DbQueryOptions<IbmWorkflowDefinition>
  ): Effect.Effect<IbmWorkflowDefinition[], WorkflowDefinitionServiceError> {
    const stage = 'WorkflowDefinitionService::listWorkflowDefinitions'
    return pipe(
      Effect.succeed(filter),
      Effect.flatMap((value) =>
        listRecordsByScopeResolution(this.workflowDefinitionRepository as any, this.scopeRepository, {
          ...(typeof value.scopeId === 'string' ? { scopeId: value.scopeId.trim() } : {}),
          scopeResolution: value.scopeResolution,
          ...(typeof value.definitionId === 'string' ? { definitionId: value.definitionId.trim() } : {}),
          ...(typeof value.mode === 'string' ? { mode: value.mode.trim() } : {}),
          ...(typeof value.subjectType === 'string' ? { subjectType: value.subjectType.trim() } : {}),
        }, options, {
          stage,
          defaultResolution: 'explicit',
          dedupeKey: (item) => String(item?.definitionId ?? '').trim().toLowerCase() || undefined,
        }).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      )
    )
  }

  upsertWorkflowDefinition(
    data: WorkflowDefinitionUpsertInput
  ): Effect.Effect<IbmWorkflowDefinition, WorkflowDefinitionServiceError> {
    const stage = 'WorkflowDefinitionService::upsertWorkflowDefinition'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((value) =>
        validateBmInputWithSchema({
          input: value,
          schema: workflowDefinitionZodSchemaInsert,
          stage,
          operation: 'WorkflowDefinitionService::upsertWorkflowDefinition.workflowDefinitionZodSchemaInsert',
          field: 'data',
        }).pipe(
          Effect.map((validated) => ({
            validated,
            matchEq: value.matchEq,
          }))
        )
      ),
      Effect.flatMap(({ validated, matchEq }) =>
        this.workflowDefinitionRepository.upsert(validated, {
          scopeId: validated.scopeId,
          definitionId: validated.definitionId,
          ...(matchEq ?? {}),
        }).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'upsert', factory: XfErrorFactory.upsertFailed }))
        )
      )
    )
  }
}
