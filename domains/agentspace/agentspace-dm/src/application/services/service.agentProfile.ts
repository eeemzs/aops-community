import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { XfLogger } from '@aopslab/xf-logger'

import type { IRepositoryPortAgentProfile, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import type { AgentProfileListFilter, IAgentProfileServicePort } from '../ports/inbound/index.js'
import { AgentProfileServiceError } from '../errors/AgentProfileServiceError.js'
import { IbmAgentProfile, IbmAgentProfileInsert, agentProfileZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface AgentProfileServiceDependencies {}

export interface AgentProfileServiceOptions {
  agentProfileRepository: IRepositoryPortAgentProfile
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<AgentProfileServiceDependencies>
  logger?: XfLogger
  locale?: string
}

const DEFAULT_AGENT_PROFILE_KIND = 'role-profile'

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function slugifyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

// agentProfile carries a `defaultAgent` convenience filter that is NOT a persisted
// column (defaultAgents is a jsonb array). Strip it before delegating to the
// scope-resolution helper so it is not turned into a matchEq equality clause, then
// post-filter in memory. Mirrors how MemoryItemService strips `projectId`.
function normalizeAgentProfileQueryFilter(filter: AgentProfileListFilter): AgentProfileListFilter {
  const normalized = { ...(filter as Record<string, unknown>) }
  delete normalized.defaultAgent
  return normalized as AgentProfileListFilter
}

export class AgentProfileService implements IAgentProfileServicePort {
  private readonly agentProfileRepository: IRepositoryPortAgentProfile
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: AgentProfileServiceOptions) {
    this.agentProfileRepository = options.agentProfileRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  createProfile(data: IbmAgentProfileInsert): Effect.Effect<IbmAgentProfile, AgentProfileServiceError> {
    const stage = 'AgentProfileService::createProfile'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) => {
        const name = normalizeNonEmpty((payload as Record<string, unknown>).name)
        if (!name) {
          return Effect.fail(XfErrorFactory.inputRequired({ field: 'name', stage }))
        }
        const role = normalizeNonEmpty((payload as Record<string, unknown>).role)
        if (!role) {
          return Effect.fail(XfErrorFactory.inputRequired({ field: 'role', stage }))
        }
        const slug = normalizeNonEmpty((payload as Record<string, unknown>).slug) ?? slugifyName(name)
        if (!slug) {
          return Effect.fail(XfErrorFactory.inputRequired({ field: 'slug', stage }))
        }
        const kind = normalizeNonEmpty((payload as Record<string, unknown>).kind) ?? DEFAULT_AGENT_PROFILE_KIND
        const normalizedPayload: IbmAgentProfileInsert = {
          ...payload,
          name,
          role,
          slug,
          kind,
        }
        return Effect.succeed(normalizedPayload)
      }),
      Effect.flatMap((payload) =>
        validateBmInputWithSchema({
          input: payload,
          schema: agentProfileZodSchemaInsert,
          stage,
          operation: 'AgentProfileService::createProfile.agentProfileZodSchemaInsert',
          field: 'data',
        }),
      ),
      Effect.flatMap((payload) => this.agentProfileRepository.create(payload).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed })),
      )),
      Effect.tapError((error) => Effect.sync(() => {
        const info = effectErrorInfo(error)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createProfile')
      })),
    )
  }

  getProfileById(id: string, options?: DbQueryOptions<IbmAgentProfile>): Effect.Effect<IbmAgentProfile | null, AgentProfileServiceError> {
    const stage = 'AgentProfileService::getProfileById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entryId) => this.agentProfileRepository.findById(entryId, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
      )),
      Effect.tapError((error) => Effect.sync(() => {
        const info = effectErrorInfo(error)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getProfileById')
      })),
    )
  }

  listProfiles(
    filter: AgentProfileListFilter = {},
    options?: DbQueryOptions<IbmAgentProfile>,
  ): Effect.Effect<IbmAgentProfile[], AgentProfileServiceError> {
    const stage = 'AgentProfileService::listProfiles'
    const defaultAgent = normalizeNonEmpty((filter as Record<string, unknown>).defaultAgent)
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) => listRecordsByScopeResolution(this.agentProfileRepository as any, this.scopeRepository, normalizeAgentProfileQueryFilter(value), options, {
        stage,
        defaultResolution: 'cascade',
        dedupeKey: (item) => normalizeNonEmpty(item?.slug)?.toLowerCase() || undefined,
      }).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound })),
      )),
      Effect.map((rows: IbmAgentProfile[]) => {
        if (!defaultAgent) return rows
        return rows.filter((row) => toArray<string>(row?.defaultAgents).includes(defaultAgent))
      }),
      Effect.tapError((error) => Effect.sync(() => {
        const info = effectErrorInfo(error)
        if ((info.unwrapped as { _tag?: string } | undefined)?._tag === 'NotFoundError') return
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listProfiles')
      })),
    )
  }

  updateProfile(id: string, patch: Partial<IbmAgentProfile>): Effect.Effect<IbmAgentProfile, AgentProfileServiceError> {
    const stage = 'AgentProfileService::updateProfile'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entryId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: agentProfileZodSchemaInsert.partial().strict(),
          stage,
          operation: 'AgentProfileService::updateProfile.agentProfileZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(Effect.map(() => entryId)),
      ),
      Effect.flatMap((entryId) =>
        this.agentProfileRepository.patchById(entryId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed })),
        ),
      ),
      Effect.tapError((error) => Effect.sync(() => {
        const info = effectErrorInfo(error)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateProfile')
      })),
    )
  }

  deleteProfile(id: string): Effect.Effect<void, AgentProfileServiceError> {
    const stage = 'AgentProfileService::deleteProfile'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entryId) =>
        this.agentProfileRepository.deleteById(entryId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed })),
        ),
      ),
      Effect.map(() => undefined),
    )
  }
}
