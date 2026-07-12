import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { XfLogger } from '@aopslab/xf-logger'
import type {
  IRepositoryPortFeedbackItem,
  IRepositoryPortIssueItem,
  IRepositoryPortMicroTaskItem,
  IRepositoryPortProjectmanEvent,
  IRepositoryPortSprint,
  IRepositoryPortSprintGroup,
} from '../ports/repository-ports/index.js'
import type {
  IKanbanTaskServicePort,
  ISprintServicePort,
  SprintAddMicrotaskInput,
  SprintCopyInput,
  SprintCreateInput,
  SprintDeleteMicrotaskInput,
  SprintMoveInput,
  SprintUpdateMicrotaskInput,
  SprintUpdateMicrotaskStatusInput,
  SprintUpdatePlanInput,
} from '../ports/inbound/index.js'
import { SprintServiceError } from '../errors/SprintServiceError.js'
import type { SprintDetail, SprintMicrotask, SprintPhase, SprintPhasePlanInput, SprintProgress } from '../../domain/dto/index.js'
import {
  IbmProjectmanEventInsert,
  IbmMicroTaskItemInsert,
  IbmSprint,
  IbmSprintGroup,
  IbmSprintInsert,
  IbmMicroTaskItem,
  microTaskItemZodSchemaInsert,
  sprintGroupZodSchemaInsert,
  sprintZodSchemaInsert,
} from '../../domain/models/index.js'
import { type MicroTaskStatus, type SprintStatus } from '../../domain/types.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'

const DEFAULT_PHASE_NAME = 'Main'
const TEMP_POSITION_BASE = 1_000_000

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = normalizeString(value)
  return normalized || undefined
}

function normalizeIsoDateString(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  const normalized = normalizeOptionalString(value)
  if (!normalized) return undefined
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

function normalizeDateValue(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  const normalized = normalizeOptionalString(value)
  if (!normalized) return undefined
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    const normalized = normalizeString(item)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function normalizeMicrotaskStatusInput(
  value: unknown,
  options?: { defaultStatus?: MicroTaskStatus },
): string | undefined {
  const normalized = normalizeString(value).toLowerCase()
  return normalized || options?.defaultStatus
}

function deriveStatus(statuses: SprintStatus[]): SprintStatus {
  if (statuses.length === 0) return 'todo'
  if (statuses.every((status) => status === 'cancelled')) return 'cancelled'
  if (statuses.every((status) => status === 'postponed')) return 'postponed'
  if (statuses.every((status) => status === 'paused')) return 'paused'
  if (statuses.every((status) => status === 'completed' || status === 'cancelled') && statuses.some((status) => status === 'completed')) {
    return 'completed'
  }
  if (statuses.some((status) => status === 'blocked')) return 'blocked'
  if (statuses.some((status) => status === 'doing')) return 'doing'
  if (statuses.some((status) => status === 'in_review')) return 'in_review'
  if (statuses.some((status) => status === 'paused')) return 'paused'
  if (statuses.some((status) => status === 'postponed')) return 'postponed'
  return 'todo'
}

function buildProgress(statuses: SprintStatus[]): SprintProgress {
  const actionable = statuses.filter((status) => status !== 'cancelled').length
  const completed = statuses.filter((status) => status === 'completed').length
  return {
    completed,
    actionable,
    total: statuses.length,
    ratio: actionable > 0 ? completed / actionable : 0,
  }
}

function buildPhasePlanInputList(input: SprintCreateInput | SprintUpdatePlanInput): SprintPhasePlanInput[] {
  if (Array.isArray(input.phases) && input.phases.length > 0) {
    return input.phases.map((phase, index) => ({
      id: normalizeOptionalString(phase?.id),
      name: normalizeString(phase?.name) || `${DEFAULT_PHASE_NAME} ${index + 1}`,
      description: phase?.description == null ? undefined : normalizeOptionalString(phase.description) ?? undefined,
      position: typeof phase?.position === 'number' && Number.isFinite(phase.position) ? phase.position : index,
      createdAt: normalizeIsoDateString(phase?.createdAt),
      updatedAt: normalizeIsoDateString(phase?.updatedAt),
      microtasks: Array.isArray(phase?.microtasks)
        ? phase.microtasks.map((microtask, microtaskIndex) => ({
            id: normalizeOptionalString(microtask?.id),
            title: normalizeString(microtask?.title) || `Microtask ${microtaskIndex + 1}`,
            status: normalizeMicrotaskStatusInput(microtask?.status, { defaultStatus: 'todo' }) as MicroTaskStatus,
            position:
              typeof microtask?.position === 'number' && Number.isFinite(microtask.position)
                ? microtask.position
                : microtaskIndex,
            notes: microtask?.notes == null ? undefined : normalizeOptionalString(microtask.notes) ?? undefined,
            createdAt: normalizeIsoDateString(microtask?.createdAt),
            updatedAt: normalizeIsoDateString(microtask?.updatedAt),
          }))
        : [],
    }))
  }

  return [
    {
      name: DEFAULT_PHASE_NAME,
      position: 0,
      microtasks: [],
    },
  ]
}

function clampPosition(value: unknown, maxInclusive: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return maxInclusive
  if (value < 0) return 0
  if (value > maxInclusive) return maxInclusive
  return Math.floor(value)
}

export interface SprintServiceOptions {
  sprintRepository: IRepositoryPortSprint
  sprintGroupRepository?: IRepositoryPortSprintGroup
  microTaskItemRepository?: IRepositoryPortMicroTaskItem
  issueItemRepository?: IRepositoryPortIssueItem
  feedbackItemRepository?: IRepositoryPortFeedbackItem
  eventRepository?: IRepositoryPortProjectmanEvent
  serviceDependencies?: {
    kanbanTaskService?: IKanbanTaskServicePort
    microTaskItemService?: unknown
    planningLineageService?: unknown
    sprintKanbanTaskLinkService?: unknown
  }
  logger?: XfLogger
  locale?: string
}

export class SprintService implements ISprintServicePort {
  private readonly sprintRepository: IRepositoryPortSprint
  private readonly sprintGroupRepository?: IRepositoryPortSprintGroup
  private readonly microTaskItemRepository?: IRepositoryPortMicroTaskItem
  private readonly eventRepository?: IRepositoryPortProjectmanEvent
  private readonly kanbanTaskService?: IKanbanTaskServicePort
  private readonly logger?: XfLogger

  constructor(options: SprintServiceOptions) {
    this.sprintRepository = options.sprintRepository
    this.sprintGroupRepository = options.sprintGroupRepository
    this.microTaskItemRepository = options.microTaskItemRepository
    this.eventRepository = options.eventRepository
    this.kanbanTaskService = options.serviceDependencies?.kanbanTaskService
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, _options?: DbQueryOptions<IbmSprint>): Effect.Effect<SprintDetail | null, SprintServiceError> {
    const stage = 'SprintService::getById'
    return Effect.gen(this, function* (_) {
      const sprintId = yield* _(validateUuidInput(id, 'id', { stage }))
      const sprint = yield* _(
        this.sprintRepository.findById(sprintId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
        ),
      )
      if (!sprint) return null
      return yield* _(this.buildSprintDetail(sprint, stage))
    }).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          const info = effectErrorInfo(error)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
        }),
      ),
    )
  }

  create(data: IbmSprintInsert): Effect.Effect<IbmSprint, SprintServiceError> {
    const stage = 'SprintService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) =>
        validateBmInputWithSchema({
          input,
          schema: sprintZodSchemaInsert,
          stage,
          operation: 'SprintService::create.sprintZodSchemaInsert',
          field: 'data',
        }),
      ),
      Effect.flatMap((payload) =>
        this.sprintRepository.create(payload).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed })),
        ),
      ),
    )
  }

  createSprint(input: SprintCreateInput): Effect.Effect<SprintDetail, SprintServiceError> {
    const stage = 'SprintService::createSprint'
    const effect = Effect.gen(this, function* (_) {
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const kanbanTaskId = normalizeString(payload.kanbanTaskId)
      if (!kanbanTaskId) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'kanbanTaskId', stage })))
      }

      const task = this.kanbanTaskService
        ? yield* _(this.kanbanTaskService.getById(kanbanTaskId) as any)
        : null
      if (!task) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: kanbanTaskId })))
      }

      const sprintRecord = yield* _(
        this.create({
          scopeId: normalizeString((payload as any).scopeId) || normalizeString((task as any).scopeId),
          kanbanTaskId,
          name: normalizeString(payload.name),
          goal: normalizeString(payload.goal),
          references: normalizeStringList(payload.references),
          scope: normalizeStringList(payload.scope),
          validationPlan: normalizeStringList(payload.validationPlan),
          notes: normalizeOptionalString(payload.notes),
          createdAt: normalizeIsoDateString((payload as any).createdAt) as any,
          updatedAt: normalizeIsoDateString((payload as any).updatedAt) as any,
          createdBy: normalizeOptionalString(payload.createdBy),
          updatedBy: normalizeOptionalString(payload.updatedBy),
        }),
      )

      yield* _(this.syncPhases(String(sprintRecord.id ?? ''), buildPhasePlanInputList(payload), stage))
      yield* _(this.syncKanbanTask(sprintRecord.kanbanTaskId, String(sprintRecord.id ?? ''), stage))

      const detail = yield* _(this.getById(String(sprintRecord.id ?? '')))
      if (!detail) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: String(sprintRecord.id ?? '') })))
      }

      yield* _(this.recordEvent({
        scopeId: detail.scopeId,
        entityType: 'sprint',
        entityId: String(detail.id ?? ''),
        action: 'sprint.create',
        payload: {
          kanbanTaskId: detail.kanbanTaskId,
          name: detail.name,
          goal: detail.goal,
          status: detail.status,
          progress: detail.progress,
        },
      }))

      return detail
    }).pipe(
      Effect.mapError((error) => error as SprintServiceError),
      Effect.tapError((error) =>
        Effect.sync(() => {
          const info = effectErrorInfo(error)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in createSprint')
        }),
      ),
    )
    return effect as Effect.Effect<SprintDetail, SprintServiceError>
  }

  updateSprint(id: string, patch: Partial<IbmSprint>): Effect.Effect<SprintDetail, SprintServiceError> {
    const stage = 'SprintService::updateSprint'
    return this.updatePlan(id, patch as SprintUpdatePlanInput).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          const info = effectErrorInfo(error)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateSprint')
        }),
      ),
    )
  }

  archiveSprint(id: string): Effect.Effect<SprintDetail, SprintServiceError> {
    const stage = 'SprintService::archiveSprint'
    return this.setSprintArchivedAt(id, new Date(), stage)
  }

  unarchiveSprint(id: string): Effect.Effect<SprintDetail, SprintServiceError> {
    const stage = 'SprintService::unarchiveSprint'
    return this.setSprintArchivedAt(id, null, stage)
  }

  private setSprintArchivedAt(id: string, archivedAt: Date | null, stage: string): Effect.Effect<SprintDetail, SprintServiceError> {
    return Effect.gen(this, function* (_) {
      const sprintId = yield* _(validateUuidInput(id, 'id', { stage }))
      const existing = yield* _(
        this.sprintRepository.findById(sprintId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
        ),
      )
      if (!existing) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: sprintId })))
      }

      yield* _(
        this.sprintRepository.patchById(sprintId, { archivedAt } as Partial<IbmSprint>).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById(archivedAt)', factory: XfErrorFactory.upsertFailed })),
        ),
      )

      const detail = yield* _(this.getById(sprintId))
      if (!detail) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: sprintId })))
      }
      return detail
    }).pipe(
      Effect.mapError((error) => error as SprintServiceError),
      Effect.tapError((error) =>
        Effect.sync(() => {
          const info = effectErrorInfo(error)
          this.logger?.error({ error: info.unwrapped, stage }, `Error in ${stage}`)
        }),
      ),
    )
  }

  updatePlan(id: string, input: SprintUpdatePlanInput): Effect.Effect<SprintDetail, SprintServiceError> {
    const stage = 'SprintService::updatePlan'
    return Effect.gen(this, function* (_) {
      const sprintId = yield* _(validateUuidInput(id, 'id', { stage }))
      const patch = yield* _(validateInput(input, 'input', { stage }))
      const existing = yield* _(
        this.sprintRepository.findById(sprintId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
        ),
      )
      if (!existing) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: sprintId })))
      }

      const expectedUpdatedAt = normalizeIsoDateString(patch.expectedUpdatedAt)
      if (patch.expectedUpdatedAt !== undefined && !expectedUpdatedAt) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.upsertFailed({
              stage,
              operation: 'expectedUpdatedAt',
              message: 'Sprint plan conflict: expectedUpdatedAt must be a valid ISO timestamp.',
            }),
          ),
        )
      }
      if (expectedUpdatedAt) {
        const currentUpdatedAt = normalizeIsoDateString(existing.updatedAt)
        if (!currentUpdatedAt || currentUpdatedAt !== expectedUpdatedAt) {
          return yield* _(
            Effect.fail(
              XfErrorFactory.upsertFailed({
                stage,
                operation: 'expectedUpdatedAt',
                message: `Sprint plan conflict: stale snapshot detected for sprint ${sprintId}. Refresh the sprint snapshot and retry.`,
                data: {
                  sprintId,
                  expectedUpdatedAt,
                  currentUpdatedAt: currentUpdatedAt ?? null,
                },
              }),
            ),
          )
        }
      }

      const dbPatch: Partial<IbmSprint> = {}
      if (patch.name !== undefined) dbPatch.name = normalizeString(patch.name)
      if (patch.goal !== undefined) dbPatch.goal = normalizeString(patch.goal)
      if (patch.references !== undefined) dbPatch.references = normalizeStringList(patch.references)
      if (patch.scope !== undefined) dbPatch.scope = normalizeStringList(patch.scope)
      if (patch.validationPlan !== undefined) dbPatch.validationPlan = normalizeStringList(patch.validationPlan)
      if (patch.notes !== undefined) dbPatch.notes = normalizeOptionalString(patch.notes)
      if ((patch as any).createdAt !== undefined) dbPatch.createdAt = normalizeDateValue((patch as any).createdAt) as any
      if ((patch as any).updatedAt !== undefined) dbPatch.updatedAt = normalizeDateValue((patch as any).updatedAt) as any
      if (patch.updatedBy !== undefined) dbPatch.updatedBy = normalizeOptionalString(patch.updatedBy)

      if (Object.keys(dbPatch).length > 0) {
        yield* _(
          this.sprintRepository.patchById(sprintId, dbPatch).pipe(
            Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed })),
          ),
        )
      }

      if (patch.phases !== undefined) {
        yield* _(
          this.deleteExistingPlan(sprintId, stage),
        )
        yield* _(this.syncPhases(sprintId, buildPhasePlanInputList(patch), stage))
        if (Object.keys(dbPatch).length === 0) {
          yield* _(this.touchSprintRecord(existing, normalizeOptionalString(patch.updatedBy), stage))
        }
      }

      const detail = yield* _(this.getById(sprintId))
      if (!detail) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: sprintId })))
      }

      yield* _(this.syncKanbanTask(detail.kanbanTaskId, sprintId, stage, detail.progress))
      yield* _(this.recordEvent({
        scopeId: detail.scopeId,
        entityType: 'sprint',
        entityId: sprintId,
        action: 'sprint.update-plan',
        payload: {
          name: detail.name,
          goal: detail.goal,
          status: detail.status,
          progress: detail.progress,
          phaseCount: detail.phases.length,
        },
      }))

      return detail
    }).pipe(Effect.mapError((error) => error as SprintServiceError))
  }

  addMicrotask(id: string, input: SprintAddMicrotaskInput): Effect.Effect<SprintDetail, SprintServiceError> {
    const stage = 'SprintService::addMicrotask'
    return Effect.gen(this, function* (_) {
      if (!this.microTaskItemRepository || !this.sprintGroupRepository) {
        return yield* _(Effect.fail(XfErrorFactory.configurationError({ stage, message: 'microTaskItemRepository is required' })))
      }

      const sprintId = yield* _(validateUuidInput(id, 'id', { stage }))
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const title = normalizeString(payload.title)
      if (!title) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'title', stage })))
      }

      const sprint = yield* _(this.getById(sprintId))
      if (!sprint) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: sprintId })))
      }

      const phase = yield* _(this.resolvePhaseFromSprintDetail(sprint, payload.phaseId ?? payload.phase, stage))
      const insertionPosition = clampPosition(payload.position, phase.microtasks.length)
      if (insertionPosition < phase.microtasks.length) {
        const shiftedPositions = [...phase.microtasks]
          .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))
          .map((microtask, index) => ({
            id: String(microtask.id ?? ''),
            position: index < insertionPosition ? index : index + 1,
          }))
          .filter((entry) => Boolean(entry.id))
        yield* _(this.applyMicrotaskPositions(shiftedPositions, normalizeOptionalString(payload.updatedBy), stage))
      }

      const createdBy = normalizeOptionalString(payload.createdBy)
      const updatedBy = normalizeOptionalString(payload.updatedBy) ?? createdBy
      const microtaskRecord = yield* _(
        this.validateMicrotaskInsert({
          phaseId: String(phase.id ?? ''),
          title,
          status: normalizeMicrotaskStatusInput(payload.status, { defaultStatus: 'todo' }) as MicroTaskStatus,
          position: insertionPosition,
          notes: normalizeOptionalString(payload.notes),
          createdBy,
          updatedBy,
        }, stage),
      )

      const createdMicrotask = yield* _(
        this.microTaskItemRepository.create(microtaskRecord).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create(microtask)', factory: XfErrorFactory.createFailed })),
        ),
      )

      yield* _(this.touchSprintRecord(sprint, updatedBy, stage))

      const detail = yield* _(this.getById(sprintId))
      if (!detail) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: sprintId })))
      }

      yield* _(this.syncKanbanTask(detail.kanbanTaskId, sprintId, stage, detail.progress))
      yield* _(this.recordEvent({
        scopeId: detail.scopeId,
        entityType: 'sprint',
        entityId: sprintId,
        action: 'sprint.add-microtask',
        payload: {
          phaseId: phase.id,
          microtaskId: createdMicrotask.id,
          title,
          position: insertionPosition,
          status: createdMicrotask.status,
          progress: detail.progress,
          sprintStatus: detail.status,
        },
      }))

      return detail
    }).pipe(Effect.mapError((error) => error as SprintServiceError))
  }

  updateMicrotask(id: string, input: SprintUpdateMicrotaskInput): Effect.Effect<SprintDetail, SprintServiceError> {
    const stage = 'SprintService::updateMicrotask'
    return Effect.gen(this, function* (_) {
      if (!this.microTaskItemRepository || !this.sprintGroupRepository) {
        return yield* _(Effect.fail(XfErrorFactory.configurationError({ stage, message: 'microTaskItemRepository is required' })))
      }

      const sprintId = yield* _(validateUuidInput(id, 'id', { stage }))
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const microtaskId = normalizeString(payload.microtaskId)
      if (!microtaskId) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'microtaskId', stage })))
      }

      const sprint = yield* _(this.getById(sprintId))
      if (!sprint) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: sprintId })))
      }

      const { phase, microtask } = yield* _(this.resolveMicrotaskFromSprintDetail(sprint, microtaskId, stage))
      const updatedBy = normalizeOptionalString(payload.updatedBy)
      const patch: Partial<IbmMicroTaskItem> = {}
      if (payload.title !== undefined) patch.title = normalizeString(payload.title)
      if (payload.status !== undefined) patch.status = normalizeMicrotaskStatusInput(payload.status) as MicroTaskStatus
      if (payload.notes !== undefined) patch.notes = normalizeOptionalString(payload.notes)
      if (updatedBy !== undefined) patch.updatedBy = updatedBy

      if (Object.keys(patch).length > 0) {
        yield* _(
          validateBmInputWithSchema({
            input: patch,
            schema: microTaskItemZodSchemaInsert.partial().strict(),
            stage,
            operation: 'SprintService::updateMicrotask.microTaskItemZodSchemaInsert.patch',
            field: 'patch',
          }),
        )
      }

      const desiredPosition =
        payload.position === undefined
          ? Number(microtask.position ?? 0)
          : clampPosition(payload.position, Math.max(phase.microtasks.length - 1, 0))
      const currentPosition = Number(microtask.position ?? 0)
      if (desiredPosition !== currentPosition) {
        const orderedIds = [...phase.microtasks]
          .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))
          .map((item) => String(item.id ?? ''))
          .filter(Boolean)
        const withoutTarget = orderedIds.filter((itemId) => itemId !== microtaskId)
        withoutTarget.splice(desiredPosition, 0, microtaskId)
        yield* _(this.reorderMicrotasks(String(phase.id ?? ''), withoutTarget, updatedBy, stage))
      }

      if (Object.keys(patch).length > 0) {
        yield* _(
          this.microTaskItemRepository.patchById(microtaskId, patch).pipe(
            Effect.mapError(mapDbError({ stage, operation: 'patchById(microtask)', factory: XfErrorFactory.upsertFailed })),
          ),
        )
      }

      yield* _(this.touchSprintRecord(sprint, updatedBy, stage))

      const detail = yield* _(this.getById(sprintId))
      if (!detail) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: sprintId })))
      }

      yield* _(this.syncKanbanTask(detail.kanbanTaskId, sprintId, stage, detail.progress))
      yield* _(this.recordEvent({
        scopeId: detail.scopeId,
        entityType: 'sprint',
        entityId: sprintId,
        action: 'sprint.update-microtask',
        payload: {
          phaseId: phase.id,
          microtaskId,
          title: patch.title ?? microtask.title,
          status: patch.status ?? microtask.status,
          position: desiredPosition,
          progress: detail.progress,
          sprintStatus: detail.status,
        },
      }))

      return detail
    }).pipe(Effect.mapError((error) => error as SprintServiceError))
  }

  updateMicrotaskStatus(id: string, input: SprintUpdateMicrotaskStatusInput): Effect.Effect<SprintDetail, SprintServiceError> {
    const stage = 'SprintService::updateMicrotaskStatus'
    return this.updateMicrotask(id, {
      microtaskId: input.microtaskId,
      status: input.status,
      updatedBy: input.updatedBy,
    }).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          const info = effectErrorInfo(error)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateMicrotaskStatus')
        }),
      ),
    )
  }

  deleteMicrotask(id: string, input: SprintDeleteMicrotaskInput): Effect.Effect<SprintDetail, SprintServiceError> {
    const stage = 'SprintService::deleteMicrotask'
    return Effect.gen(this, function* (_) {
      if (!this.microTaskItemRepository || !this.sprintGroupRepository) {
        return yield* _(Effect.fail(XfErrorFactory.configurationError({ stage, message: 'microTaskItemRepository is required' })))
      }

      const sprintId = yield* _(validateUuidInput(id, 'id', { stage }))
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const microtaskId = normalizeString(payload.microtaskId)
      if (!microtaskId) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'microtaskId', stage })))
      }

      const sprint = yield* _(this.getById(sprintId))
      if (!sprint) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: sprintId })))
      }

      const { phase, microtask } = yield* _(this.resolveMicrotaskFromSprintDetail(sprint, microtaskId, stage))

      yield* _(
        this.microTaskItemRepository.deleteById(microtaskId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById(microtask)', factory: XfErrorFactory.upsertFailed })),
        ),
      )

      const remainingIds = [...phase.microtasks]
        .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))
        .map((item) => String(item.id ?? ''))
        .filter((itemId) => itemId && itemId !== microtaskId)
      if (remainingIds.length > 0) {
        yield* _(this.reorderMicrotasks(String(phase.id ?? ''), remainingIds, normalizeOptionalString(payload.updatedBy), stage))
      }

      yield* _(this.touchSprintRecord(sprint, normalizeOptionalString(payload.updatedBy), stage))

      const detail = yield* _(this.getById(sprintId))
      if (!detail) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: sprintId })))
      }

      yield* _(this.syncKanbanTask(detail.kanbanTaskId, sprintId, stage, detail.progress))
      yield* _(this.recordEvent({
        scopeId: detail.scopeId,
        entityType: 'sprint',
        entityId: sprintId,
        action: 'sprint.delete-microtask',
        payload: {
          phaseId: phase.id,
          microtaskId,
          title: microtask.title,
          progress: detail.progress,
          sprintStatus: detail.status,
        },
      }))

      return detail
    }).pipe(Effect.mapError((error) => error as SprintServiceError))
  }

  moveSprint(_id: string, _input: SprintMoveInput): Effect.Effect<IbmSprint, SprintServiceError> {
    return Effect.fail(
      XfErrorFactory.configurationError({
        stage: 'SprintService::moveSprint',
        message: 'Sprint move is not supported in Sprint V2',
      }),
    )
  }

  copySprint(_id: string, _input: SprintCopyInput): Effect.Effect<IbmSprint, SprintServiceError> {
    return Effect.fail(
      XfErrorFactory.configurationError({
        stage: 'SprintService::copySprint',
        message: 'Sprint copy is not supported in Sprint V2',
      }),
    )
  }

  listSprints(filter: Partial<IbmSprint> = {}, options?: DbQueryOptions<IbmSprint>, listOptions?: { includeArchived?: boolean }): Effect.Effect<SprintDetail[], SprintServiceError> {
    const stage = 'SprintService::listSprints'
    const includeArchived = listOptions?.includeArchived === true
    return Effect.gen(this, function* (_) {
      const items = yield* _(
        this.sprintRepository.find({ matchEq: filter, options } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound })),
        ),
      )
      const visibleItems = includeArchived ? items : items.filter((item) => (item as any)?.archivedAt == null)
      return yield* _(
        Effect.forEach(visibleItems, (item) => this.buildSprintDetail(item, stage), { concurrency: 1 }),
      )
    })
  }

  removeSprint(id: string): Effect.Effect<void, SprintServiceError> {
    const stage = 'SprintService::removeSprint'
    return Effect.gen(this, function* (_) {
      const sprintId = yield* _(validateUuidInput(id, 'id', { stage }))
      const existing = yield* _(
        this.sprintRepository.findById(sprintId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
        ),
      )
      if (!existing) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: sprintId })))
      }

      yield* _(this.deleteExistingPlan(sprintId, stage))
      yield* _(
        this.sprintRepository.deleteById(sprintId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed })),
        ),
      )
      yield* _(this.syncKanbanTask(existing.kanbanTaskId, undefined, stage))
    }).pipe(Effect.map(() => undefined))
  }

  private resolvePhaseFromSprintDetail(
    sprint: SprintDetail,
    phaseRef: unknown,
    stage: string,
  ): Effect.Effect<SprintPhase, SprintServiceError> {
    const normalizedRef = normalizeString(phaseRef) || DEFAULT_PHASE_NAME
    const normalizedLabel = normalizedRef.toLowerCase()
    const phase =
      sprint.phases.find((item) => String(item.id ?? '') === normalizedRef) ??
      sprint.phases.find((item) => normalizeString(item.name).toLowerCase() === normalizedLabel) ??
      null

    if (!phase) {
      return Effect.fail(XfErrorFactory.notFound({ stage, identifier: `phase:${normalizedRef}` }))
    }

    return Effect.succeed(phase)
  }

  private resolveMicrotaskFromSprintDetail(
    sprint: SprintDetail,
    microtaskId: string,
    stage: string,
  ): Effect.Effect<{ phase: SprintPhase; microtask: SprintMicrotask }, SprintServiceError> {
    for (const phase of sprint.phases) {
      const microtask = phase.microtasks.find((item) => String(item.id ?? '') === microtaskId)
      if (microtask) {
        return Effect.succeed({ phase, microtask })
      }
    }
    return Effect.fail(XfErrorFactory.notFound({ stage, identifier: microtaskId }))
  }

  private validateMicrotaskInsert(
    input: Partial<IbmMicroTaskItemInsert>,
    stage: string,
  ): Effect.Effect<IbmMicroTaskItemInsert, SprintServiceError> {
    return validateBmInputWithSchema({
      input,
      schema: microTaskItemZodSchemaInsert,
      stage,
      operation: 'SprintService::validateMicrotaskInsert.microTaskItemZodSchemaInsert',
      field: 'microtask',
    }) as Effect.Effect<IbmMicroTaskItemInsert, SprintServiceError>
  }

  private applyMicrotaskPositions(
    entries: Array<{ id: string; position: number }>,
    updatedBy: string | undefined,
    stage: string,
  ): Effect.Effect<void, SprintServiceError> {
    if (!this.microTaskItemRepository || entries.length === 0) {
      return Effect.succeed(undefined)
    }

    return Effect.gen(this, function* (_) {
      yield* _(
        Effect.forEach(
          entries,
          (entry, index) =>
            this.microTaskItemRepository!.patchById(entry.id, {
              position: TEMP_POSITION_BASE + index,
              ...(updatedBy !== undefined ? { updatedBy } : {}),
            } as Partial<IbmMicroTaskItem>).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(microtask:temp)', factory: XfErrorFactory.upsertFailed })),
            ),
          { concurrency: 1 },
        ),
      )

      yield* _(
        Effect.forEach(
          entries,
          (entry) =>
            this.microTaskItemRepository!.patchById(entry.id, {
              position: entry.position,
              ...(updatedBy !== undefined ? { updatedBy } : {}),
            } as Partial<IbmMicroTaskItem>).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(microtask:final)', factory: XfErrorFactory.upsertFailed })),
            ),
          { concurrency: 1 },
        ),
      )
    })
  }

  private reorderMicrotasks(
    _phaseId: string,
    orderedIds: string[],
    updatedBy: string | undefined,
    stage: string,
  ): Effect.Effect<void, SprintServiceError> {
    return this.applyMicrotaskPositions(
      orderedIds.map((entryId, index) => ({ id: entryId, position: index })),
      updatedBy,
      stage,
    )
  }

  private touchSprintRecord(
    sprint: Pick<IbmSprint, 'id' | 'updatedBy'>,
    updatedBy: string | undefined,
    stage: string,
  ): Effect.Effect<void, SprintServiceError> {
    const sprintId = String(sprint.id ?? '')
    if (!sprintId) return Effect.succeed(undefined)

    const touchPatch: Partial<IbmSprint> = {
      updatedBy: updatedBy ?? normalizeOptionalString(sprint.updatedBy) ?? 'system:projectman',
    }

    return this.sprintRepository.patchById(sprintId, touchPatch).pipe(
      Effect.mapError(mapDbError({ stage, operation: 'patchById(sprint:touch)', factory: XfErrorFactory.upsertFailed })),
      Effect.map(() => undefined),
    )
  }

  private buildSprintDetail(sprint: IbmSprint, stage: string): Effect.Effect<SprintDetail, SprintServiceError> {
    return Effect.gen(this, function* (_) {
      const phases = yield* _(this.listPhases(String(sprint.id ?? ''), stage))
      const microtasks = yield* _(this.listMicrotasksForPhases(phases, stage))
      const microtasksByPhaseId = new Map<string, SprintMicrotask[]>()

      for (const microtask of microtasks) {
        const phaseId = String((microtask as any).phaseId ?? '')
        const group = microtasksByPhaseId.get(phaseId) ?? []
        group.push(microtask)
        microtasksByPhaseId.set(phaseId, group)
      }

      const phaseDetails: SprintPhase[] = phases.map((phase) => {
        const phaseMicrotasks = [...(microtasksByPhaseId.get(String(phase.id ?? '')) ?? [])].sort(
          (left, right) => Number(left.position ?? 0) - Number(right.position ?? 0),
        )
        const phaseStatuses = phaseMicrotasks.map((microtask) => microtask.status as SprintStatus)
        return {
          ...phase,
          status: deriveStatus(phaseStatuses),
          progress: buildProgress(phaseStatuses),
          microtasks: phaseMicrotasks,
        }
      })

      if (phaseDetails.length === 0) {
        phaseDetails.push({
          id: `virtual-${String(sprint.id ?? '')}`,
          tenantId: String(sprint.tenantId ?? ''),
          createdAt: sprint.createdAt,
          updatedAt: sprint.updatedAt,
          sprintId: String(sprint.id ?? ''),
          name: DEFAULT_PHASE_NAME,
          description: undefined,
          position: 0,
          createdBy: sprint.createdBy,
          updatedBy: sprint.updatedBy,
          status: 'todo',
          progress: buildProgress([]),
          microtasks: [],
        })
      }

      const sprintStatuses = phaseDetails.flatMap((phase) => phase.microtasks.map((microtask) => microtask.status as SprintStatus))
      return {
        ...sprint,
        status: deriveStatus(sprintStatuses),
        progress: buildProgress(sprintStatuses),
        phases: phaseDetails.sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0)),
      }
    })
  }

  private listPhases(sprintId: string, stage: string): Effect.Effect<IbmSprintGroup[], SprintServiceError> {
    if (!this.sprintGroupRepository) {
      return Effect.succeed([])
    }
    return this.sprintGroupRepository.find({
      matchEq: { sprintId },
      options: { sort: [{ field: 'position', type: 'asc' }] },
    } as any).pipe(
      Effect.mapError(mapDbError({ stage, operation: 'find(phases)', factory: XfErrorFactory.notFound })),
    )
  }

  private listMicrotasksForPhases(phases: IbmSprintGroup[], stage: string): Effect.Effect<IbmMicroTaskItem[], SprintServiceError> {
    if (!this.microTaskItemRepository || phases.length === 0) {
      return Effect.succeed([])
    }
    return Effect.forEach(
      phases,
      (phase) =>
        this.microTaskItemRepository!.find({
          matchEq: { phaseId: String(phase.id ?? '') },
          options: { sort: [{ field: 'position', type: 'asc' }] },
        } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find(microtasks)', factory: XfErrorFactory.notFound })),
        ),
      { concurrency: 1 },
    ).pipe(Effect.map((groups) => groups.flat()))
  }

  private syncPhases(
    sprintId: string,
    phases: SprintPhasePlanInput[],
    stage: string,
  ): Effect.Effect<void, SprintServiceError> {
    if (!this.sprintGroupRepository) {
      return Effect.fail(XfErrorFactory.configurationError({ stage, message: 'sprintGroupRepository is required' }))
    }
    return Effect.gen(this, function* (_) {
      for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
        const phase = phases[phaseIndex]!
        const phaseRecord = yield* _(
          validateBmInputWithSchema({
            input: {
              sprintId,
              name: normalizeString(phase.name),
              description: normalizeOptionalString(phase.description),
              position: typeof phase.position === 'number' && Number.isFinite(phase.position) ? phase.position : phaseIndex,
              createdAt: normalizeIsoDateString(phase.createdAt) as any,
              updatedAt: normalizeIsoDateString(phase.updatedAt) as any,
              createdBy: undefined,
              updatedBy: undefined,
            },
            schema: sprintGroupZodSchemaInsert,
            stage,
            operation: 'SprintService::syncPhases.sprintGroupZodSchemaInsert',
            field: 'phase',
          }),
        )

        const createdPhase = yield* _(
          this.sprintGroupRepository!.create(phaseRecord).pipe(
            Effect.mapError(mapDbError({ stage, operation: 'create(phase)', factory: XfErrorFactory.createFailed })),
          ),
        )

        const microtasks = Array.isArray(phase.microtasks) ? phase.microtasks : []
        for (let microtaskIndex = 0; microtaskIndex < microtasks.length; microtaskIndex += 1) {
          const microtask = microtasks[microtaskIndex]!
          const microtaskRecord = yield* _(
            validateBmInputWithSchema({
              input: {
                phaseId: String(createdPhase.id ?? ''),
                title: normalizeString(microtask.title),
                status: normalizeMicrotaskStatusInput(microtask.status, { defaultStatus: 'todo' }) as MicroTaskStatus,
                position:
                  typeof microtask.position === 'number' && Number.isFinite(microtask.position)
                    ? microtask.position
                    : microtaskIndex,
                notes: normalizeOptionalString(microtask.notes),
                createdAt: normalizeIsoDateString(microtask.createdAt) as any,
                updatedAt: normalizeIsoDateString(microtask.updatedAt) as any,
                createdBy: undefined,
                updatedBy: undefined,
              },
              schema: microTaskItemZodSchemaInsert,
              stage,
              operation: 'SprintService::syncPhases.microTaskItemZodSchemaInsert',
              field: 'microtask',
            }),
          )
          yield* _(
            this.microTaskItemRepository!.create(microtaskRecord).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'create(microtask)', factory: XfErrorFactory.createFailed })),
            ),
          )
        }
      }
    })
  }

  private deleteExistingPlan(sprintId: string, stage: string): Effect.Effect<void, SprintServiceError> {
    return Effect.gen(this, function* (_) {
      const phases = yield* _(this.listPhases(sprintId, stage))
      for (const phase of phases) {
        const phaseId = String(phase.id ?? '')
        const microtasks = yield* _(
          this.microTaskItemRepository
            ? this.microTaskItemRepository.find({ matchEq: { phaseId } } as any).pipe(
                Effect.mapError(mapDbError({ stage, operation: 'find(microtasks)', factory: XfErrorFactory.notFound })),
              )
            : Effect.succeed([] as IbmMicroTaskItem[]),
        )
        for (const microtask of microtasks) {
          yield* _(
            this.microTaskItemRepository!.deleteById(String(microtask.id ?? '')).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'deleteById(microtask)', factory: XfErrorFactory.upsertFailed })),
            ),
          )
        }
        yield* _(
          this.sprintGroupRepository!.deleteById(phaseId).pipe(
            Effect.mapError(mapDbError({ stage, operation: 'deleteById(phase)', factory: XfErrorFactory.upsertFailed })),
          ),
        )
      }
    })
  }

  private syncKanbanTask(
    kanbanTaskId: string,
    sprintId: string | undefined,
    stage: string,
    progress?: SprintProgress,
  ): Effect.Effect<void, SprintServiceError> {
    if (!this.kanbanTaskService) return Effect.succeed(undefined)
    const taskId = normalizeString(kanbanTaskId)
    if (!taskId) return Effect.succeed(undefined)
    return Effect.gen(this, function* (_) {
      yield* _(
        this.kanbanTaskService!.updateTask(taskId, {
          sprintId: sprintId ?? null,
          ...(progress ? { progress: Math.round(progress.ratio * 100) } : {}),
        } as any),
      )
    }).pipe(
      Effect.catchAll((error) => {
        const message = error instanceof Error ? error.message : String(error ?? '')
        const code =
          error && typeof error === 'object' && 'code' in error && typeof (error as any).code === 'string'
            ? (error as any).code
            : ''
        if (code === 'NotFound' || /findbyid|record not found|not found/i.test(message)) {
          return Effect.sync(() => {
            const info = effectErrorInfo(error)
            this.logger?.warn(
              {
                stage,
                kanbanTaskId: taskId,
                sprintId: sprintId ?? null,
                error: info.unwrapped,
              },
              'Skipping sprint task sync because linked kanban task is missing',
            )
          }).pipe(Effect.as(undefined))
        }
        return Effect.fail(error as SprintServiceError)
      }),
      Effect.mapError((error) => error as SprintServiceError),
    )
  }

  private recordEvent(event: IbmProjectmanEventInsert): Effect.Effect<void, SprintServiceError> {
    if (!this.eventRepository) return Effect.succeed(undefined)
    return this.eventRepository.create(event as any).pipe(
      Effect.mapError(mapDbError({ stage: 'SprintService::recordEvent', operation: event.action, factory: XfErrorFactory.createFailed })),
      Effect.map(() => undefined),
    )
  }
}
