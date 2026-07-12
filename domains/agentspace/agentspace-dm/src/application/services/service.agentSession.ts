import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortAgentSession, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import type { AgentSessionListFilter, AgentSessionStartInput, IAgentSessionServicePort } from '../ports/inbound/index.js'
import { AgentSessionServiceError } from '../errors/AgentSessionServiceError.js'
import { IbmAgentSession, IbmAgentSessionInsert, agentSessionZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface AgentSessionServiceDependencies {}

export interface AgentSessionServiceOptions {
  agentSessionRepository: IRepositoryPortAgentSession
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<AgentSessionServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class AgentSessionService implements IAgentSessionServicePort {
  private readonly agentSessionRepository: IRepositoryPortAgentSession
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: AgentSessionServiceOptions) {
    this.agentSessionRepository = options.agentSessionRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmAgentSession>): Effect.Effect<IbmAgentSession | null, AgentSessionServiceError> {
    const stage = 'AgentSessionService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.agentSessionRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmAgentSessionInsert): Effect.Effect<IbmAgentSession, AgentSessionServiceError> {
    const stage = 'AgentSessionService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: agentSessionZodSchemaInsert,
          stage,
          operation: 'AgentSessionService::create.agentSessionZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.agentSessionRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  startAgentSession(data: AgentSessionStartInput): Effect.Effect<IbmAgentSession, AgentSessionServiceError> {
    const stage = 'AgentSessionService::startAgentSession'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.map((payload) => ({
        ...payload,
        status: payload.status ?? 'active',
        startedAt: payload.startedAt ?? new Date(),
      })),
      Effect.flatMap((payload) => this.create(payload as IbmAgentSessionInsert)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in startAgentSession')
      }))
    )
  }

  endAgentSession(id: string, status?: IbmAgentSession['status'], endedAt?: Date): Effect.Effect<IbmAgentSession, AgentSessionServiceError> {
    const stage = 'AgentSessionService::endAgentSession'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((sessionId) =>
        this.agentSessionRepository.patchById(sessionId, {
          status: status ?? 'ended',
          endedAt: endedAt ?? new Date(),
        } as Partial<IbmAgentSession>).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in endAgentSession')
      }))
    )
  }

  listAgentSessions(
    filter: AgentSessionListFilter = {},
    options?: DbQueryOptions<IbmAgentSession>
  ): Effect.Effect<IbmAgentSession[], AgentSessionServiceError> {
    const stage = 'AgentSessionService::listAgentSessions'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) => listRecordsByScopeResolution(this.agentSessionRepository as any, this.scopeRepository, value, options, {
        stage,
        defaultResolution: 'explicit',
      }).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listAgentSessions')
      }))
    )
  }
}
