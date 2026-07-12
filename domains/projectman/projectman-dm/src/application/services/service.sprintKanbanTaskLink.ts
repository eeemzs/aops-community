import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortSprintKanbanTaskLink, IRepositoryPortProjectmanEvent } from '../ports/repository-ports/index.js'
import type { ISprintKanbanTaskLinkServicePort, SprintKanbanTaskLinkCreateInput } from '../ports/inbound/index.js'
import { SprintKanbanTaskLinkServiceError } from '../errors/SprintKanbanTaskLinkServiceError.js'
import { IbmSprintKanbanTaskLink, IbmSprintKanbanTaskLinkInsert, IbmProjectmanEventInsert, sprintKanbanTaskLinkZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface SprintKanbanTaskLinkServiceDependencies {}

export interface SprintKanbanTaskLinkServiceOptions {
  sprintKanbanTaskLinkRepository: IRepositoryPortSprintKanbanTaskLink
  eventRepository?: IRepositoryPortProjectmanEvent
  serviceDependencies?: Partial<SprintKanbanTaskLinkServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class SprintKanbanTaskLinkService implements ISprintKanbanTaskLinkServicePort {
  private readonly sprintKanbanTaskLinkRepository: IRepositoryPortSprintKanbanTaskLink
  private readonly eventRepository?: IRepositoryPortProjectmanEvent
  private readonly logger?: XfLogger

  constructor(options: SprintKanbanTaskLinkServiceOptions) {
    this.sprintKanbanTaskLinkRepository = options.sprintKanbanTaskLinkRepository
    this.eventRepository = options.eventRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmSprintKanbanTaskLink>): Effect.Effect<IbmSprintKanbanTaskLink | null, SprintKanbanTaskLinkServiceError> {
    const stage = 'SprintKanbanTaskLinkService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.sprintKanbanTaskLinkRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmSprintKanbanTaskLinkInsert): Effect.Effect<IbmSprintKanbanTaskLink, SprintKanbanTaskLinkServiceError> {
    const stage = 'SprintKanbanTaskLinkService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: sprintKanbanTaskLinkZodSchemaInsert,
          stage,
          operation: 'SprintKanbanTaskLinkService::create.sprintKanbanTaskLinkZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.sprintKanbanTaskLinkRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  createLink(input: SprintKanbanTaskLinkCreateInput): Effect.Effect<IbmSprintKanbanTaskLink, SprintKanbanTaskLinkServiceError> {
    const stage = 'SprintKanbanTaskLinkService::createLink'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) => this.create(payload as IbmSprintKanbanTaskLinkInsert)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createLink')
      }))
    )
  }

  linkTaskToSprint(input: SprintKanbanTaskLinkCreateInput): Effect.Effect<IbmSprintKanbanTaskLink, SprintKanbanTaskLinkServiceError> {
    const stage = 'SprintKanbanTaskLinkService::linkTaskToSprint'
    return Effect.gen(this, function* (_) {
      const payload = yield* _(validateInput(input, 'input', { stage }))
      const existing = yield* _(
        this.sprintKanbanTaskLinkRepository.find({
          matchEq: { sprintId: payload.sprintId, kanbanTaskId: payload.kanbanTaskId } as Partial<IbmSprintKanbanTaskLink>,
          options: { limit: 1 },
        } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      )

      if (existing?.[0]) {
        return existing[0] as IbmSprintKanbanTaskLink
      }

      const created = yield* _(this.create(payload as IbmSprintKanbanTaskLinkInsert))

      yield* _(this.recordEvent({
        scopeId: created.scopeId,
        projectId: created.projectId,
        entityType: 'kanban-task',
        entityId: created.kanbanTaskId ?? payload.kanbanTaskId ?? '',
        action: 'kanban.task.link-sprint',
        payload: { sprintId: created.sprintId, kanbanTaskId: created.kanbanTaskId },
      }))

      return created
    }).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in linkTaskToSprint')
      }))
    )
  }

  unlinkTaskFromSprint(sprintId: string, kanbanTaskId: string): Effect.Effect<number, SprintKanbanTaskLinkServiceError> {
    const stage = 'SprintKanbanTaskLinkService::unlinkTaskFromSprint'
    return Effect.gen(this, function* (_) {
      yield* _(validateInput(sprintId, 'sprintId', { stage }))
      yield* _(validateInput(kanbanTaskId, 'kanbanTaskId', { stage }))

      const existing = yield* _(
        this.sprintKanbanTaskLinkRepository.find({
          matchEq: { sprintId, kanbanTaskId } as Partial<IbmSprintKanbanTaskLink>,
          options: { limit: 1 },
        } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      )

      const deleted = yield* _(
        this.sprintKanbanTaskLinkRepository.deleteMany({ matchEq: { sprintId, kanbanTaskId } as any } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteMany', factory: XfErrorFactory.upsertFailed }))
        )
      )

      if (existing?.[0]) {
        const link = existing[0] as IbmSprintKanbanTaskLink
        yield* _(this.recordEvent({
          scopeId: link.scopeId,
          projectId: link.projectId,
          entityType: 'kanban-task',
          entityId: link.kanbanTaskId ?? kanbanTaskId ?? '',
          action: 'kanban.task.unlink-sprint',
          payload: { sprintId: link.sprintId, kanbanTaskId: link.kanbanTaskId },
        }))
      }

      return deleted
    }).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in unlinkTaskFromSprint')
      }))
    )
  }

  listLinks(
    filter: Partial<IbmSprintKanbanTaskLink> = {},
    options?: DbQueryOptions<IbmSprintKanbanTaskLink>
  ): Effect.Effect<IbmSprintKanbanTaskLink[], SprintKanbanTaskLinkServiceError> {
    const stage = 'SprintKanbanTaskLinkService::listLinks'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) =>
        this.sprintKanbanTaskLinkRepository.find({ matchEq: filter, options } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listLinks')
      }))
    )
  }

  private recordEvent(input: {
    scopeId: string
    projectId?: string
    entityType: string
    entityId: string
    action: string
    payload?: unknown
    actorId?: string
  }): Effect.Effect<void, SprintKanbanTaskLinkServiceError> {
    if (!this.eventRepository) return Effect.succeed(undefined)
    const stage = 'SprintKanbanTaskLinkService::recordEvent'
    const event: IbmProjectmanEventInsert = {
      scopeId: input.scopeId,
      projectId: input.projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      payload: input.payload,
      actorId: input.actorId,
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
