import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortMemoryItem, IRepositoryPortMission, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import type {
  IMissionServicePort,
  MissionCreateInput,
  MissionListFilter,
  MissionResumeCheckpointProjection,
  MissionResumeCheckpointSummary,
  MissionResumePack,
  MissionResumePackOptions,
} from '../ports/inbound/index.js'
import { MissionServiceError } from '../errors/MissionServiceError.js'
import { IbmMemoryItem, IbmMission, IbmMissionInsert, missionZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface MissionServiceDependencies {}

export interface MissionServiceOptions {
  missionRepository: IRepositoryPortMission
  memoryItemRepository?: IRepositoryPortMemoryItem
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<MissionServiceDependencies>
  logger?: XfLogger
  locale?: string
}

function toMissionRefs(mission: IbmMission): unknown[] {
  return [
    ...(Array.isArray(mission.references) ? mission.references : []),
    mission.visionDocRef,
    mission.activeImplementationPlanRef,
    mission.sourceTemplateRef,
  ].filter(Boolean)
}

function extractPlanSprintId(ref: unknown): string | undefined {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return undefined
  const record = ref as { refType?: unknown; refId?: unknown }
  if (record.refType === 'projectman.sprint' && typeof record.refId === 'string') return record.refId
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeNonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
  return strings.length > 0 ? strings : undefined
}

function toIsoString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString()
  return normalizeNonEmpty(value)
}

function timestampMs(value: unknown): number {
  const iso = toIsoString(value)
  if (!iso) return 0
  const parsed = Date.parse(iso)
  return Number.isFinite(parsed) ? parsed : 0
}

function summarizeText(value: unknown, maxLength = 240): string | undefined {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined
  const compact = normalized.replace(/\s+/g, ' ').trim()
  return compact.length <= maxLength ? compact : `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function memoryItemMeta(item: IbmMemoryItem): Record<string, unknown> {
  return isRecord(item.meta) ? item.meta : {}
}

function checkpointPayload(item: IbmMemoryItem): Record<string, unknown> {
  const meta = memoryItemMeta(item)
  return isRecord(meta.checkpoint) ? meta.checkpoint : {}
}

function checkpointTags(item: IbmMemoryItem): string[] {
  return Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : []
}

function isCheckpointMemoryItem(item: IbmMemoryItem): boolean {
  const kind = normalizeNonEmpty(item.kind)?.toLowerCase()
  const meta = memoryItemMeta(item)
  if (normalizeNonEmpty(meta.checkpointAs) === 'milestone') return false
  if (kind === 'checkpoint') return true
  const tags = new Set(checkpointTags(item))
  return tags.has('memory:checkpoint') || normalizeNonEmpty(meta.checkpointAs) === 'session' || isRecord(meta.checkpoint)
}

function checkpointSupersedes(item: IbmMemoryItem): string | undefined {
  const meta = memoryItemMeta(item)
  const nested = checkpointPayload(item)
  return normalizeNonEmpty(meta.supersedes) ?? normalizeNonEmpty(nested.supersedes)
}

function checkpointSummary(
  item: IbmMemoryItem,
  state: { currentId?: string; supersededIds: Set<string> },
): MissionResumeCheckpointSummary {
  const meta = memoryItemMeta(item)
  const checkpoint = checkpointPayload(item)
  const id = normalizeNonEmpty(item.id)
  return {
    id,
    kind: normalizeNonEmpty(item.kind),
    checkpointAs: normalizeNonEmpty(meta.checkpointAs) ?? (item.kind === 'checkpoint' ? 'session' : undefined),
    current: Boolean(id && state.currentId === id),
    superseded: Boolean(id && state.supersededIds.has(id)),
    supersedes: checkpointSupersedes(item),
    summary: summarizeText(checkpoint.summary ?? item.content),
    position: summarizeText(checkpoint.position, 180),
    doneWork: toStringArray(checkpoint.doneWork)?.slice(0, 8),
    nextSteps: toStringArray(checkpoint.nextSteps)?.slice(0, 8),
    sourceRefs: Array.isArray(checkpoint.sourceRefs) ? checkpoint.sourceRefs.slice(0, 8) : undefined,
    anchors: checkpoint.anchors,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
  }
}

function buildCheckpointProjection(
  items: IbmMemoryItem[],
  options: MissionResumePackOptions,
): MissionResumeCheckpointProjection {
  const limit = Math.min(Math.max(Number.isInteger(options.limit) && options.limit ? Number(options.limit) : 5, 1), 20)
  const checkpoints = items
    .filter(isCheckpointMemoryItem)
    .sort((a, b) => {
      const updatedDiff = timestampMs(b.updatedAt) - timestampMs(a.updatedAt)
      if (updatedDiff !== 0) return updatedDiff
      return timestampMs(b.createdAt) - timestampMs(a.createdAt)
    })

  const supersededIds = new Set<string>()
  for (const item of checkpoints) {
    const supersedes = checkpointSupersedes(item)
    if (supersedes) supersededIds.add(supersedes)
  }

  const current = checkpoints.find((item) => {
    const id = normalizeNonEmpty(item.id)
    return Boolean(id && !supersededIds.has(id))
  })
  const currentId = normalizeNonEmpty(current?.id)
  const state = { currentId, supersededIds }
  return {
    current: current ? checkpointSummary(current, state) : undefined,
    recent: checkpoints.slice(0, limit).map((item) => checkpointSummary(item, state)),
    total: checkpoints.length,
  }
}

export class MissionService implements IMissionServicePort {
  private readonly missionRepository: IRepositoryPortMission
  private readonly memoryItemRepository?: IRepositoryPortMemoryItem
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: MissionServiceOptions) {
    this.missionRepository = options.missionRepository
    this.memoryItemRepository = options.memoryItemRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmMission>): Effect.Effect<IbmMission | null, MissionServiceError> {
    const stage = 'MissionService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.missionRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmMissionInsert): Effect.Effect<IbmMission, MissionServiceError> {
    const stage = 'MissionService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.map((payload) => ({
        ...payload,
        status: payload.status ?? 'draft',
      })),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: missionZodSchemaInsert,
          stage,
          operation: 'MissionService::create.missionZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.missionRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  createMission(data: MissionCreateInput): Effect.Effect<IbmMission, MissionServiceError> {
    const stage = 'MissionService::createMission'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.map((payload) => ({
        ...payload,
        status: payload.status ?? 'draft',
      })),
      Effect.flatMap((payload) => this.create(payload as IbmMissionInsert)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createMission')
      }))
    )
  }

  updateMission(id: string, patch: Partial<IbmMissionInsert>): Effect.Effect<IbmMission, MissionServiceError> {
    const stage = 'MissionService::updateMission'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: missionZodSchemaInsert.partial().strict(),
          stage,
          operation: 'MissionService::updateMission.missionZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((missionId) =>
        this.missionRepository.patchById(missionId, patch as Partial<IbmMission>).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateMission')
      }))
    )
  }

  removeMission(id: string): Effect.Effect<void, MissionServiceError> {
    const stage = 'MissionService::removeMission'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((missionId) =>
        this.missionRepository.deleteById(missionId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed })),
          Effect.asVoid,
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeMission')
      }))
    )
  }

  listMissions(
    filter: MissionListFilter = {},
    options?: DbQueryOptions<IbmMission>
  ): Effect.Effect<IbmMission[], MissionServiceError> {
    const stage = 'MissionService::listMissions'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) => listRecordsByScopeResolution(this.missionRepository as any, this.scopeRepository, value, options, {
        stage,
        defaultResolution: 'explicit',
      }).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        if ((info.unwrapped as { _tag?: string } | undefined)?._tag === 'NotFoundError') return
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listMissions')
      }))
    )
  }

  private buildMissionCheckpointProjection(
    mission: IbmMission,
    requestedId: string,
    options: MissionResumePackOptions,
  ): Effect.Effect<MissionResumeCheckpointProjection, MissionServiceError> {
    const stage = 'MissionService::buildMissionCheckpointProjection'
    if (!this.memoryItemRepository) return Effect.succeed({ recent: [], total: 0 })
    const missionId = mission.id ?? requestedId
    const requestedLimit = Number.isInteger(options.limit) && options.limit ? Number(options.limit) : 5
    const scanLimit = Math.min(Math.max(requestedLimit * 4, 16), 50)

    return pipe(
      this.memoryItemRepository.find({
        matchEq: {
          sourceType: 'agentspace.mission',
          sourceId: missionId,
        },
        options: {
          limit: scanLimit,
          sort: [{ field: 'updatedAt', type: 'desc' }],
        },
      }),
      Effect.mapError(mapDbError({ stage, operation: 'memoryItem.find', factory: XfErrorFactory.notFound })),
      Effect.map((items) => buildCheckpointProjection(items, options)),
    )
  }

  buildResumePack(id: string, options: MissionResumePackOptions = {}): Effect.Effect<MissionResumePack, MissionServiceError> {
    const stage = 'MissionService::buildResumePack'
    return pipe(
      this.getById(id),
      Effect.flatMap((mission) => {
        if (!mission) {
          return Effect.fail(XfErrorFactory.notFound({ identifier: id, stage }))
        }
        const activePlanRef = mission.activeImplementationPlanRef
        return pipe(
          this.buildMissionCheckpointProjection(mission, id, options),
          Effect.map((checkpoints) => ({
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            mission: {
              id: mission.id ?? id,
              slug: mission.slug,
              objective: mission.objective,
              status: mission.status,
              policy: mission.policy,
              refs: toMissionRefs(mission),
            },
            activePlan: {
              ref: activePlanRef,
              sprintId: extractPlanSprintId(activePlanRef),
              currentSlice: {},
              nextSlice: {},
              progress: {},
            },
            memory: [],
            checkpoints,
            reviews: [],
            issues: [],
            chat: {
              unread: 0,
              lastN: [],
            },
          } satisfies MissionResumePack)),
        )
      }),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in buildResumePack')
      }))
    )
  }
}
