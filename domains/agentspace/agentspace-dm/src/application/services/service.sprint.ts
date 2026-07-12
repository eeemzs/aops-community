import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortSprint } from '../ports/repository-ports/index.js'
import type { ISprintServicePort, ISprintItemServicePort, SprintItemCreateInput } from '../ports/inbound/index.js'
import { SprintServiceError } from '../errors/SprintServiceError.js'
import { IbmSprint, IbmSprintInsert, IbmSprintItem, sprintZodSchemaInsert, sprintItemZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface SprintServiceOptions {
  sprintRepository: IRepositoryPortSprint
  sprintItemService: ISprintItemServicePort
  logger?: XfLogger
  locale?: string
}

export class SprintService implements ISprintServicePort {
  private readonly sprintRepository: IRepositoryPortSprint
  private readonly sprintItemService: ISprintItemServicePort
  private readonly logger?: XfLogger

  constructor(options: SprintServiceOptions) {
    this.sprintRepository = options.sprintRepository
    this.sprintItemService = options.sprintItemService
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmSprint>): Effect.Effect<IbmSprint | null, SprintServiceError> {
    const stage = 'SprintService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.sprintRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmSprintInsert): Effect.Effect<IbmSprint, SprintServiceError> {
    const stage = 'SprintService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: sprintZodSchemaInsert,
          stage,
          operation: 'SprintService::create.sprintZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.sprintRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  getSprint(id: string, options?: DbQueryOptions<IbmSprint>): Effect.Effect<IbmSprint | null, SprintServiceError> {
    return this.getById(id, options)
  }

  listSprints(
    filter: Partial<IbmSprint> = {},
    options?: DbQueryOptions<IbmSprint>
  ): Effect.Effect<IbmSprint[], SprintServiceError> {
    const stage = 'SprintService::listSprints'
    const queryOptions = options?.sort
      ? options
      : { ...options, sort: [{ field: 'startAt', type: 'desc' }] }
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.sprintRepository.find({ matchEq: filter, options: queryOptions } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listSprints')
      }))
    )
  }

  updateSprint(id: string, patch: Partial<IbmSprint>): Effect.Effect<IbmSprint, SprintServiceError> {
    const stage = 'SprintService::updateSprint'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: sprintZodSchemaInsert.partial().strict(),
          stage,
          operation: 'SprintService::updateSprint.sprintZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((sprintId) => this.sprintRepository.patchById(sprintId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateSprint')
      }))
    )
  }

  activateSprint(id: string): Effect.Effect<IbmSprint, SprintServiceError> {
    const stage = 'SprintService::activateSprint'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap(() => this.updateSprint(id, { status: 'active' }))
    )
  }

  completeSprint(id: string): Effect.Effect<IbmSprint, SprintServiceError> {
    const stage = 'SprintService::completeSprint'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap(() => this.updateSprint(id, { status: 'completed' }))
    )
  }

  supersedeSprint(id: string): Effect.Effect<IbmSprint, SprintServiceError> {
    const stage = 'SprintService::supersedeSprint'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap(() => this.updateSprint(id, { status: 'superseded' }))
    )
  }

  removeSprint(id: string): Effect.Effect<void, SprintServiceError> {
    const stage = 'SprintService::removeSprint'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((sprintId) =>
        this.sprintRepository.deleteById(sprintId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }

  addSprintItem(data: SprintItemCreateInput): Effect.Effect<IbmSprintItem, SprintServiceError> {
    const stage = 'SprintService::addSprintItem'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) =>
        this.sprintItemService.addSprintItem(payload).pipe(
          Effect.mapError((cause) => XfErrorFactory.createFailed({ stage, operation: 'sprintItemService.addSprintItem', cause }))
        )
      )
    )
  }

  updateSprintItem(id: string, patch: Partial<IbmSprintItem>): Effect.Effect<IbmSprintItem, SprintServiceError> {
    const stage = 'SprintService::updateSprintItem'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: sprintItemZodSchemaInsert.partial().strict(),
          stage,
          operation: 'SprintService::updateSprintItem.sprintItemZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap(() =>
        this.sprintItemService.updateSprintItem(id, patch).pipe(
          Effect.mapError((cause) => XfErrorFactory.upsertFailed({ stage, operation: 'sprintItemService.updateSprintItem', cause }))
        )
      )
    )
  }

  reorderSprintItems(sprintId: string, orderedItemIds: string[]): Effect.Effect<number, SprintServiceError> {
    const stage = 'SprintService::reorderSprintItems'
    return pipe(
      validateInput(sprintId, 'sprintId', { stage }),
      Effect.flatMap(() =>
        this.sprintItemService.reorderSprintItems(sprintId, orderedItemIds).pipe(
          Effect.mapError((cause) => XfErrorFactory.upsertFailed({ stage, operation: 'sprintItemService.reorderSprintItems', cause }))
        )
      )
    )
  }

  closeSprintItem(id: string, closedAt?: Date): Effect.Effect<IbmSprintItem, SprintServiceError> {
    const stage = 'SprintService::closeSprintItem'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap(() =>
        this.sprintItemService.closeSprintItem(id, closedAt).pipe(
          Effect.mapError((cause) => XfErrorFactory.upsertFailed({ stage, operation: 'sprintItemService.closeSprintItem', cause }))
        )
      )
    )
  }
}
