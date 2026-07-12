import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortKanbanBoardColumn } from '../ports/repository-ports/index.js'
import type { IKanbanBoardColumnServicePort, KanbanBoardColumnCreateInput } from '../ports/inbound/index.js'
import { KanbanBoardColumnServiceError } from '../errors/KanbanBoardColumnServiceError.js'
import { IbmKanbanBoardColumn, IbmKanbanBoardColumnInsert, kanbanBoardColumnZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface KanbanBoardColumnServiceDependencies {}

export interface KanbanBoardColumnServiceOptions {
  kanbanBoardColumnRepository: IRepositoryPortKanbanBoardColumn
  serviceDependencies?: Partial<KanbanBoardColumnServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class KanbanBoardColumnService implements IKanbanBoardColumnServicePort {
  private readonly kanbanBoardColumnRepository: IRepositoryPortKanbanBoardColumn
  private readonly logger?: XfLogger

  constructor(options: KanbanBoardColumnServiceOptions) {
    this.kanbanBoardColumnRepository = options.kanbanBoardColumnRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmKanbanBoardColumn>): Effect.Effect<IbmKanbanBoardColumn | null, KanbanBoardColumnServiceError> {
    const stage = 'KanbanBoardColumnService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.kanbanBoardColumnRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmKanbanBoardColumnInsert): Effect.Effect<IbmKanbanBoardColumn, KanbanBoardColumnServiceError> {
    const stage = 'KanbanBoardColumnService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: kanbanBoardColumnZodSchemaInsert,
          stage,
          operation: 'KanbanBoardColumnService::create.kanbanBoardColumnZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.kanbanBoardColumnRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  addColumnToBoard(input: KanbanBoardColumnCreateInput): Effect.Effect<IbmKanbanBoardColumn, KanbanBoardColumnServiceError> {
    const stage = 'KanbanBoardColumnService::addColumnToBoard'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) => {
        const normalized = { ...payload } as IbmKanbanBoardColumnInsert
        if (normalized.position === undefined || normalized.position === null) {
          return pipe(
            this.listBoardColumns({ boardId: normalized.boardId }, { sort: [{ field: 'position', type: 'desc' }], limit: 1 }),
            Effect.map((items) => {
              const next = items?.[0]?.position ?? -1
              return { ...normalized, position: next + 1 }
            })
          )
        }
        return Effect.succeed(normalized)
      }),
      Effect.flatMap((data) => this.create(data)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in addColumnToBoard')
      }))
    )
  }

  updateBoardColumn(id: string, patch: Partial<IbmKanbanBoardColumn>): Effect.Effect<IbmKanbanBoardColumn, KanbanBoardColumnServiceError> {
    const stage = 'KanbanBoardColumnService::updateBoardColumn'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: kanbanBoardColumnZodSchemaInsert.partial().strict(),
          stage,
          operation: 'KanbanBoardColumnService::updateBoardColumn.kanbanBoardColumnZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((columnId) => this.kanbanBoardColumnRepository.patchById(columnId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateBoardColumn')
      }))
    )
  }

  listBoardColumns(
    filter: Partial<IbmKanbanBoardColumn> = {},
    options?: DbQueryOptions<IbmKanbanBoardColumn>
  ): Effect.Effect<IbmKanbanBoardColumn[], KanbanBoardColumnServiceError> {
    const stage = 'KanbanBoardColumnService::listBoardColumns'
    const queryOptions = options?.sort
      ? options
      : { ...options, sort: [{ field: 'position', type: 'asc' }] }
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.kanbanBoardColumnRepository.find({ matchEq: filter, options: queryOptions } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listBoardColumns')
      }))
    )
  }

  reorderBoardColumns(boardId: string, orderedColumnIds: string[]): Effect.Effect<number, KanbanBoardColumnServiceError> {
    const stage = 'KanbanBoardColumnService::reorderBoardColumns'
    const tempBase = 1000000
    return pipe(
      validateInput(boardId, 'boardId', { stage }),
      Effect.flatMap(() => validateInput(orderedColumnIds, 'orderedColumnIds', { stage })),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedColumnIds,
          (id, index) =>
            this.kanbanBoardColumnRepository.patchById(id, { position: tempBase + index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(temp)', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedColumnIds,
          (id, index) =>
            this.kanbanBoardColumnRepository.patchById(id, { position: index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(final)', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.map(() => orderedColumnIds.length),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in reorderBoardColumns')
      }))
    )
  }

  removeBoardColumn(id: string): Effect.Effect<void, KanbanBoardColumnServiceError> {
    const stage = 'KanbanBoardColumnService::removeBoardColumn'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((boardColumnId) =>
        this.kanbanBoardColumnRepository.deleteById(boardColumnId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeBoardColumn')
      }))
    )
  }
}
