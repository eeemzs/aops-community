import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortAgentRunEvent, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import type { AgentRunEventListFilter, IAgentRunEventServicePort } from '../ports/inbound/index.js'
import { AgentRunEventServiceError } from '../errors/AgentRunEventServiceError.js'
import { IbmAgentRunEvent, IbmAgentRunEventInsert, agentRunEventZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface AgentRunEventServiceDependencies {}

export interface AgentRunEventServiceOptions {
  agentRunEventRepository: IRepositoryPortAgentRunEvent
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<AgentRunEventServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class AgentRunEventService implements IAgentRunEventServicePort {
  private readonly agentRunEventRepository: IRepositoryPortAgentRunEvent
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: AgentRunEventServiceOptions) {
    this.agentRunEventRepository = options.agentRunEventRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmAgentRunEvent>): Effect.Effect<IbmAgentRunEvent | null, AgentRunEventServiceError> {
    const stage = 'AgentRunEventService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.agentRunEventRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmAgentRunEventInsert): Effect.Effect<IbmAgentRunEvent, AgentRunEventServiceError> {
    const stage = 'AgentRunEventService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: agentRunEventZodSchemaInsert,
          stage,
          operation: 'AgentRunEventService::create.agentRunEventZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.agentRunEventRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }
  
  listAgentRunEvents(
    filter: AgentRunEventListFilter = {},
    options?: DbQueryOptions<IbmAgentRunEvent>
  ): Effect.Effect<IbmAgentRunEvent[], AgentRunEventServiceError> {
    const stage = 'AgentRunEventService::listAgentRunEvents'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) => listRecordsByScopeResolution(this.agentRunEventRepository as any, this.scopeRepository, value as Record<string, unknown> & AgentRunEventListFilter, options, {
        stage,
        defaultResolution: 'explicit',
      }).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listAgentRunEvents')
      }))
    )
  }
}
