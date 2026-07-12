import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortKanbanColumn } from '../ports/repository-ports/index.js'
import type { IKanbanColumnServicePort, KanbanColumnCreateInput } from '../ports/inbound/index.js'
import { KanbanColumnServiceError } from '../errors/KanbanColumnServiceError.js'
import { IbmKanbanColumn, IbmKanbanColumnInsert, kanbanColumnZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface KanbanColumnServiceDependencies {}

export interface KanbanColumnServiceOptions {
  kanbanColumnRepository: IRepositoryPortKanbanColumn
  serviceDependencies?: Partial<KanbanColumnServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class KanbanColumnService implements IKanbanColumnServicePort {
  private readonly kanbanColumnRepository: IRepositoryPortKanbanColumn
  private readonly logger?: XfLogger

  constructor(options: KanbanColumnServiceOptions) {
    this.kanbanColumnRepository = options.kanbanColumnRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmKanbanColumn>): Effect.Effect<IbmKanbanColumn | null, KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.kanbanColumnRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmKanbanColumnInsert): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) => {
        if (data.position === undefined || data.position === null) {
          return pipe(
            this.listColumns({ boardId: data.boardId }),
            Effect.map((items) => {
              const next = (items ?? []).reduce(
                (max, item) => Math.max(max, Number.isFinite(item?.position) ? item.position : -1),
                -1,
              )
              return { ...data, position: next + 1 }
            })
          )
        }
        return Effect.succeed(data)
      }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: kanbanColumnZodSchemaInsert,
          stage,
          operation: 'KanbanColumnService::create.kanbanColumnZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.kanbanColumnRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  addColumn(data: KanbanColumnCreateInput): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::addColumn'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) => this.create(payload as IbmKanbanColumnInsert)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in addColumn')
      }))
    )
  }

  updateColumn(id: string, patch: Partial<IbmKanbanColumn>): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::updateColumn'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: kanbanColumnZodSchemaInsert.partial().strict(),
          stage,
          operation: 'KanbanColumnService::updateColumn.kanbanColumnZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((columnId) => this.kanbanColumnRepository.patchById(columnId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateColumn')
      }))
    )
  }

  setColumnWipLimit(id: string, wipLimit?: number | null): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::setColumnWipLimit'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap(() => this.updateColumn(id, { wipLimit: wipLimit === null ? (null as any) : wipLimit }))
    )
  }

  listColumns(
    filter: Partial<IbmKanbanColumn> = {},
    options?: DbQueryOptions<IbmKanbanColumn>
  ): Effect.Effect<IbmKanbanColumn[], KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::listColumns'
    const queryOptions = options?.sort
      ? options
      : { ...options, sort: [{ field: 'position', type: 'asc' }] }
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.kanbanColumnRepository.find({ matchEq: filter, options: queryOptions } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listColumns')
      }))
    )
  }

  reorderColumns(boardId: string, orderedColumnIds: string[]): Effect.Effect<number, KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::reorderColumns'
    const tempBase = 1000000
    return pipe(
      validateInput(boardId, 'boardId', { stage }),
      Effect.flatMap(() => validateInput(orderedColumnIds, 'orderedColumnIds', { stage })),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedColumnIds,
          (id, index) =>
            this.kanbanColumnRepository.patchById(id, { position: tempBase + index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(temp)', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedColumnIds,
          (id, index) =>
            this.kanbanColumnRepository.patchById(id, { position: index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(final)', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.map(() => orderedColumnIds.length),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in reorderColumns')
      }))
    )
  }
}
