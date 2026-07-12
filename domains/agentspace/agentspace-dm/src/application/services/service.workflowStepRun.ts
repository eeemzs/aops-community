import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortScope, IRepositoryPortWorkflowStepRun } from '../ports/repository-ports/index.js'
import type { IWorkflowStepRunServicePort, WorkflowStepRunListFilter } from '../ports/inbound/index.js'
import { WorkflowStepRunServiceError } from '../errors/WorkflowStepRunServiceError.js'
import { IbmWorkflowStepRun, IbmWorkflowStepRunInsert, workflowStepRunZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface WorkflowStepRunServiceDependencies {}

export interface WorkflowStepRunServiceOptions {
  workflowStepRunRepository: IRepositoryPortWorkflowStepRun
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<WorkflowStepRunServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class WorkflowStepRunService implements IWorkflowStepRunServicePort {
  private readonly workflowStepRunRepository: IRepositoryPortWorkflowStepRun
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: WorkflowStepRunServiceOptions) {
    this.workflowStepRunRepository = options.workflowStepRunRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmWorkflowStepRun>): Effect.Effect<IbmWorkflowStepRun | null, WorkflowStepRunServiceError> {
    const stage = 'WorkflowStepRunService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.workflowStepRunRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmWorkflowStepRunInsert): Effect.Effect<IbmWorkflowStepRun, WorkflowStepRunServiceError> {
    const stage = 'WorkflowStepRunService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: workflowStepRunZodSchemaInsert,
          stage,
          operation: 'WorkflowStepRunService::create.workflowStepRunZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.workflowStepRunRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  listWorkflowStepRuns(
    filter: WorkflowStepRunListFilter = {},
    options?: DbQueryOptions<IbmWorkflowStepRun>
  ): Effect.Effect<IbmWorkflowStepRun[], WorkflowStepRunServiceError> {
    const stage = 'WorkflowStepRunService::listWorkflowStepRuns'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) => listRecordsByScopeResolution(this.workflowStepRunRepository as any, this.scopeRepository, value as Record<string, unknown> & WorkflowStepRunListFilter, options, {
        stage,
        defaultResolution: 'explicit',
      }).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listWorkflowStepRuns')
      }))
    )
  }
}
