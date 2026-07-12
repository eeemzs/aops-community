import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortAgentRun } from '../ports/repository-ports/index.js'
import type { AgentRunRecordInput, IAgentRunServicePort } from '../ports/inbound/index.js'
import type { AgentRunServiceError } from '../errors/AgentRunServiceError.js'
import { IbmAgentRun, IbmAgentRunInsert, agentRunZodSchemaInsert } from '../../domain/models/index.js'
import { IdbAgentRunDrizzle } from '../../infrastructure/db/agentRun/drizzle/drizzle.schema.agentRun.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface AgentRunServiceDependencies {}

export interface AgentRunServiceOptions {
  agentRunRepository: IRepositoryPortAgentRun
  serviceDependencies?: Partial<AgentRunServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class AgentRunService implements IAgentRunServicePort {
  private readonly agentRunRepository: IRepositoryPortAgentRun
  private readonly logger?: XfLogger

  constructor(options: AgentRunServiceOptions) {
    this.agentRunRepository = options.agentRunRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmAgentRun>): Effect.Effect<IbmAgentRun | null, AgentRunServiceError> {
    const stage = 'AgentRunService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((validatedId: string) => Effect.mapError(
        this.agentRunRepository.findById(validatedId, options),
        mapDbError<AgentRunServiceError>({ stage, operation: 'findById', factory: XfErrorFactory.notFound })
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmAgentRunInsert): Effect.Effect<IbmAgentRun, AgentRunServiceError> {
    const stage = 'AgentRunService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((validatedData: IbmAgentRunInsert) =>
        validateBmInputWithSchema({
          input: validatedData,
          schema: agentRunZodSchemaInsert,
          stage,
          operation: 'AgentRunService::create.agentRunZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((validatedData: IbmAgentRunInsert) => Effect.mapError(
        this.agentRunRepository.create(validatedData),
        mapDbError<AgentRunServiceError>({ stage, operation: 'create', factory: XfErrorFactory.createFailed })
      ))
    )
  }

  getAgentRun(id: string, options?: DbQueryOptions<IbmAgentRun>): Effect.Effect<IbmAgentRun | null, AgentRunServiceError> {
    return this.getById(id, options)
  }

  recordAgentRun(data: AgentRunRecordInput): Effect.Effect<IbmAgentRun, AgentRunServiceError> {
    const stage = 'AgentRunService::recordAgentRun'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload: AgentRunRecordInput) => this.create(payload)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in recordAgentRun')
      }))
    )
  }

  attachRunToTask(id: string, taskId: string | null): Effect.Effect<IbmAgentRun, AgentRunServiceError> {
    const stage = 'AgentRunService::attachRunToTask'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((runId: string) => Effect.mapError(
        this.agentRunRepository.patchById(runId, { taskId }),
        mapDbError<AgentRunServiceError>({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed })
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in attachRunToTask')
      }))
    )
  }

  listAgentRuns(
    filter: Partial<IbmAgentRun> = {},
    options?: DbQueryOptions<IdbAgentRunDrizzle>
  ): Effect.Effect<IbmAgentRun[], AgentRunServiceError> {
    const stage = 'AgentRunService::listAgentRuns'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((validatedFilter: Partial<IbmAgentRun>) => Effect.mapError(
        this.agentRunRepository.find({ matchEq: validatedFilter, options }),
        mapDbError<AgentRunServiceError>({ stage, operation: 'find', factory: XfErrorFactory.notFound })
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listAgentRuns')
      }))
    )
  }
}
