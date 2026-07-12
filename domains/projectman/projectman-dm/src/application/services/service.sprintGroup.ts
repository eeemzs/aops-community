import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortProjectmanEvent, IRepositoryPortSprintGroup } from '../ports/repository-ports/index.js'
import type {
  IMicroTaskItemServicePort,
  ISprintGroupServicePort,
  ISprintServicePort,
  SprintGroupCopyInput,
  SprintGroupCreateInput,
  SprintGroupMoveInput,
} from '../ports/inbound/index.js'
import { SprintGroupServiceError } from '../errors/SprintGroupServiceError.js'
import { IbmProjectmanEventInsert, IbmSprintGroup, IbmSprintGroupInsert, sprintGroupZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface SprintGroupServiceDependencies {
  microTaskItemService: IMicroTaskItemServicePort
  sprintService: ISprintServicePort
}

export interface SprintGroupServiceOptions {
  sprintGroupRepository: IRepositoryPortSprintGroup
  eventRepository?: IRepositoryPortProjectmanEvent
  serviceDependencies?: Partial<SprintGroupServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class SprintGroupService implements ISprintGroupServicePort {
  private readonly sprintGroupRepository: IRepositoryPortSprintGroup
  private readonly eventRepository?: IRepositoryPortProjectmanEvent
  private readonly microTaskItemService?: IMicroTaskItemServicePort
  private readonly sprintService?: ISprintServicePort
  private readonly logger?: XfLogger

  constructor(options: SprintGroupServiceOptions) {
    this.sprintGroupRepository = options.sprintGroupRepository
    this.eventRepository = options.eventRepository
    this.microTaskItemService = options.serviceDependencies?.microTaskItemService
    this.sprintService = options.serviceDependencies?.sprintService
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmSprintGroup>): Effect.Effect<IbmSprintGroup | null, SprintGroupServiceError> {
    const stage = 'SprintGroupService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.sprintGroupRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  moveGroup(id: string, input: SprintGroupMoveInput): Effect.Effect<IbmSprintGroup, SprintGroupServiceError> {
    const stage = 'SprintGroupService::moveGroup'
    return Effect.gen(this, function* (_) {
      yield* _(validateUuidInput(id, 'id', { stage }))
      yield* _(validateInput(input, 'input', { stage }))

      const before = yield* _(
        this.sprintGroupRepository.findById(id).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      )
      if (!before) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: id })))
      }

      const sourceSprintId = before.sprintId
      const targetSprintId = input.sprintId ?? sourceSprintId
      const targetSprint = yield* _(this.requireSprint(targetSprintId, stage))
      const changedSprint = targetSprintId !== sourceSprintId
      const position = input.position !== undefined
        ? input.position
        : changedSprint
          ? yield* _(this.nextGroupPosition(targetSprintId))
          : before.position

      const updated = yield* _(this.updateGroup(id, {
        sprintId: targetSprintId,
        position,
      } as any))

      if (changedSprint) {
        const childMicroTasks = yield* _(this.microTaskItemService?.listMicroTasks({ sprintGroupId: id } as any) ?? Effect.succeed([]))
        yield* _(
          Effect.forEach(
            childMicroTasks,
            (microTask) => this.microTaskItemService?.moveMicroTask(String((microTask as any)?.id ?? ''), {
              projectId: targetSprint.scopeId,
              sprintId: targetSprintId,
              sprintGroupId: id,
            }) ?? Effect.succeed(undefined as any),
            { concurrency: 1 },
          ),
        )
      }

      yield* _(this.recordEvent({
        scopeId: targetSprint.scopeId,
        entityType: 'sprint-group',
        entityId: updated.id ?? id,
        action: 'sprint.group.move',
        payload: {
          fromSprintId: sourceSprintId,
          toSprintId: targetSprintId,
          toPosition: position ?? null,
        },
      }))

      return updated
    }).pipe(
      Effect.mapError((error) => error as SprintGroupServiceError),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in moveGroup')
      }))
    )
  }

  copyGroup(id: string, input: SprintGroupCopyInput): Effect.Effect<IbmSprintGroup, SprintGroupServiceError> {
    const stage = 'SprintGroupService::copyGroup'
    return Effect.gen(this, function* (_) {
      yield* _(validateUuidInput(id, 'id', { stage }))
      yield* _(validateInput(input, 'input', { stage }))

      const source = yield* _(
        this.sprintGroupRepository.findById(id).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      )
      if (!source) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: id })))
      }

      const targetSprintId = input.sprintId ?? source.sprintId
      const targetSprint = yield* _(this.requireSprint(targetSprintId, stage))
      const created = yield* _(
        this.addGroup({
          sprintId: targetSprintId,
          name: input.name ?? source.name,
          description: input.description !== undefined ? input.description ?? undefined : source.description ?? undefined,
          position: input.position,
        } as any)
      )

      const sourceMicroTasks = yield* _(this.microTaskItemService?.listMicroTasks({ sprintGroupId: id } as any) ?? Effect.succeed([]))
      yield* _(
        Effect.forEach(
          sourceMicroTasks,
          (microTask) => this.microTaskItemService?.copyMicroTask(String((microTask as any)?.id ?? ''), {
            projectId: targetSprint.scopeId,
            sprintId: targetSprintId,
            sprintGroupId: created.id ?? undefined,
            kanbanTaskId: null,
          }) ?? Effect.succeed(undefined as any),
          { concurrency: 1 },
        ),
      )

      yield* _(this.recordEvent({
        scopeId: targetSprint.scopeId,
        entityType: 'sprint-group',
        entityId: created.id ?? '',
        action: 'sprint.group.copy',
        payload: {
          sourceSprintGroupId: source.id ?? id,
          sourceSprintId: source.sprintId,
          targetSprintId,
        },
      }))

      return created
    }).pipe(
      Effect.mapError((error) => error as SprintGroupServiceError),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in copyGroup')
      }))
    )
  }

  create(data: IbmSprintGroupInsert): Effect.Effect<IbmSprintGroup, SprintGroupServiceError> {
    const stage = 'SprintGroupService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: sprintGroupZodSchemaInsert,
          stage,
          operation: 'SprintGroupService::create.sprintGroupZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.sprintGroupRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  addGroup(input: SprintGroupCreateInput): Effect.Effect<IbmSprintGroup, SprintGroupServiceError> {
    const stage = 'SprintGroupService::addGroup'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) => {
        const normalized = { ...payload } as IbmSprintGroupInsert
        if (normalized.position === undefined || normalized.position === null) {
          return pipe(
            this.listGroups({ sprintId: normalized.sprintId }),
            Effect.map((items) => {
              const next = items.reduce((highest, item) => (
                typeof item.position === 'number' && Number.isFinite(item.position)
                  ? Math.max(highest, item.position)
                  : highest
              ), -1)
              return { ...normalized, position: next + 1 }
            })
          )
        }
        return Effect.succeed(normalized)
      }),
      Effect.flatMap((data) => this.softDuplicateGuardGroup(data)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in addGroup')
      }))
    )
  }

  updateGroup(id: string, patch: Partial<IbmSprintGroup>): Effect.Effect<IbmSprintGroup, SprintGroupServiceError> {
    const stage = 'SprintGroupService::updateGroup'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: sprintGroupZodSchemaInsert.partial().strict(),
          stage,
          operation: 'SprintGroupService::updateGroup.sprintGroupZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((groupId) => this.sprintGroupRepository.patchById(groupId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateGroup')
      }))
    )
  }

  listGroups(
    filter: Partial<IbmSprintGroup> = {},
    options?: DbQueryOptions<IbmSprintGroup>
  ): Effect.Effect<IbmSprintGroup[], SprintGroupServiceError> {
    const stage = 'SprintGroupService::listGroups'
    const queryOptions = options?.sort
      ? options
      : { ...options, sort: [{ field: 'position', type: 'asc' }] }
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.sprintGroupRepository.find({ matchEq: filter, options: queryOptions } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listGroups')
      }))
    )
  }

  reorderGroups(sprintId: string, orderedGroupIds: string[]): Effect.Effect<number, SprintGroupServiceError> {
    const stage = 'SprintGroupService::reorderGroups'
    const tempBase = 1000000
    return pipe(
      validateInput(sprintId, 'sprintId', { stage }),
      Effect.flatMap(() => validateInput(orderedGroupIds, 'orderedGroupIds', { stage })),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedGroupIds,
          (id, index) =>
            this.sprintGroupRepository.patchById(id, { position: tempBase + index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(temp)', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedGroupIds,
          (id, index) =>
            this.sprintGroupRepository.patchById(id, { position: index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(final)', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.map(() => orderedGroupIds.length),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in reorderGroups')
      }))
    )
  }

  removeGroup(id: string): Effect.Effect<void, SprintGroupServiceError> {
    const stage = 'SprintGroupService::removeGroup'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((groupId) =>
        this.sprintGroupRepository.deleteById(groupId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeGroup')
      }))
    )
  }

  private softDuplicateGuardGroup(data: IbmSprintGroupInsert): Effect.Effect<IbmSprintGroup, SprintGroupServiceError> {
    const name = String((data as any).name ?? '').trim()
    const sprintId = String(data.sprintId ?? '').trim()
    if (!name || !sprintId) {
      return this.create(data)
    }
    return pipe(
      this.listGroups({ sprintId, name } as any),
      Effect.flatMap((existing) => {
        if (existing.length > 0 && existing[0]) {
          this.logger?.info({ name, sprintId }, 'Soft duplicate guard: returning existing sprint-group instead of creating duplicate')
          return Effect.succeed(existing[0])
        }
        return this.create(data)
      }),
      Effect.catchAll(() => this.create(data))
    )
  }

  private requireSprint(id: string, stage: string): Effect.Effect<{ id: string; scopeId: string }, SprintGroupServiceError> {
    const sprintService = this.sprintService
    if (!sprintService) {
      return Effect.fail(XfErrorFactory.notFound({ stage, identifier: 'sprintService' }))
    }
    return Effect.gen(function* (_) {
      const sprint = yield* _(sprintService.getById(id).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'getById(sprint)', factory: XfErrorFactory.notFound }))
      ))
      if (!sprint?.id || !sprint.scopeId) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: id })))
      }
      return sprint as { id: string; scopeId: string }
    })
  }

  private nextGroupPosition(sprintId: string): Effect.Effect<number, SprintGroupServiceError> {
    return pipe(
      this.listGroups({ sprintId }),
      Effect.map((items) => items.reduce((max, item) => Math.max(max, item.position ?? -1), -1) + 1),
    )
  }

  private recordEvent(input: {
    scopeId: string
    entityType: string
    entityId: string
    action: string
    payload?: unknown
  }): Effect.Effect<void, SprintGroupServiceError> {
    if (!this.eventRepository) return Effect.succeed(undefined)
    const stage = 'SprintGroupService::recordEvent'
    const event: IbmProjectmanEventInsert = {
      scopeId: input.scopeId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      payload: input.payload,
    } as any
    return pipe(
      this.eventRepository.create(event).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ),
      Effect.asVoid,
      Effect.catchAll((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.warn({ error: info.unwrapped, stage }, 'Event log failed')
        })
      )
    )
  }

}
