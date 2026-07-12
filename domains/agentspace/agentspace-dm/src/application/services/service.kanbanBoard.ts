import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortKanbanBoard } from '../ports/repository-ports/index.js'
import type { IKanbanBoardServicePort, IKanbanColumnServicePort, ITaskServicePort, KanbanBoardView, KanbanColumnCreateInput } from '../ports/inbound/index.js'
import { KanbanBoardServiceError } from '../errors/KanbanBoardServiceError.js'
import { IbmKanbanBoard, IbmKanbanBoardInsert, IbmKanbanColumn, IbmTask, kanbanBoardZodSchemaInsert, kanbanColumnZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { KANBAN_STATUS_KEYS } from '../../domain/types.js'

export interface KanbanBoardServiceOptions {
  kanbanBoardRepository: IRepositoryPortKanbanBoard
  kanbanColumnService: IKanbanColumnServicePort
  taskService: ITaskServicePort
  logger?: XfLogger
  locale?: string
}

export class KanbanBoardService implements IKanbanBoardServicePort {
  private readonly kanbanBoardRepository: IRepositoryPortKanbanBoard
  private readonly kanbanColumnService: IKanbanColumnServicePort
  private readonly taskService: ITaskServicePort
  private readonly logger?: XfLogger

  constructor(options: KanbanBoardServiceOptions) {
    this.kanbanBoardRepository = options.kanbanBoardRepository
    this.kanbanColumnService = options.kanbanColumnService
    this.taskService = options.taskService
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmKanbanBoard>): Effect.Effect<IbmKanbanBoard | null, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.kanbanBoardRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmKanbanBoardInsert): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: kanbanBoardZodSchemaInsert,
          stage,
          operation: 'KanbanBoardService::create.kanbanBoardZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.kanbanBoardRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  createBoard(data: IbmKanbanBoardInsert): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError> {
    return this.create(data)
  }

  updateBoard(id: string, patch: Partial<IbmKanbanBoard>): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::updateBoard'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: kanbanBoardZodSchemaInsert.partial().strict(),
          stage,
          operation: 'KanbanBoardService::updateBoard.kanbanBoardZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((boardId) => this.kanbanBoardRepository.patchById(boardId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateBoard')
      }))
    )
  }

  ensureDefaultBoard(projectId: string): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::ensureDefaultBoard'
    const defaultBoardName = 'Default'

    const toColumnName = (statusKey: string) =>
      statusKey.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')

    return pipe(
      validateInput(projectId, 'projectId', { stage }),
      Effect.flatMap((projectId) =>
        this.kanbanBoardRepository.find({ matchEq: { projectId }, options: { limit: 1 } } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.flatMap((boards) => {
        if (boards.length > 0) return Effect.succeed(boards[0])

        return pipe(
          this.createBoard({ projectId, name: defaultBoardName } as IbmKanbanBoardInsert),
          Effect.flatMap((board): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError> => {
            const boardId = board.id
            if (!boardId) {
              return Effect.fail(XfErrorFactory.notFound({ stage, identifier: 'board.id' }))
            }
            return Effect.forEach(
              KANBAN_STATUS_KEYS,
              (statusKey, index) =>
                this.kanbanColumnService.addColumn({
                  projectId,
                  boardId,
                  name: toColumnName(statusKey),
                  statusKey,
                  position: index,
                }).pipe(
                  Effect.mapError((cause) =>
                    XfErrorFactory.createFailed({ stage, operation: 'kanbanColumnService.addColumn', cause })
                  )
                ),
              { concurrency: 1 }
            ).pipe(Effect.as(board))
          })
        )
      }),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in ensureDefaultBoard')
      }))
    )
  }

  listBoards(
    filter: Partial<IbmKanbanBoard> = {},
    options?: DbQueryOptions<IbmKanbanBoard>
  ): Effect.Effect<IbmKanbanBoard[], KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::listBoards'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) =>
        this.kanbanBoardRepository.find({ matchEq: filter, options } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in listBoards')
        })
      )
    )
  }

  listBoard(boardId: string): Effect.Effect<KanbanBoardView, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::listBoard'
    return pipe(
      validateInput(boardId, 'boardId', { stage }),
      Effect.flatMap((boardId) =>
        this.getById(boardId).pipe(
          Effect.flatMap((board) =>
            board
              ? Effect.succeed(board)
              : Effect.fail(XfErrorFactory.notFound({ stage, identifier: boardId }))
          )
        )
      ),
      Effect.flatMap((board) =>
        this.kanbanColumnService.listColumns({ boardId: board.id }).pipe(
          Effect.mapError((cause) =>
            XfErrorFactory.notFound({ stage, operation: 'kanbanColumnService.listColumns', cause })
          ),
          Effect.flatMap((columns) =>
            Effect.forEach(
              columns,
              (column) =>
                this.taskService.searchTasks(
                  { columnId: column.id },
                  { sort: [{ field: 'position', type: 'asc' }] }
                ).pipe(
                  Effect.mapError((cause) =>
                    XfErrorFactory.notFound({ stage, operation: 'taskService.searchTasks', cause })
                  ),
                  Effect.map((tasks) => ({ ...column, tasks }))
                ),
              { concurrency: 1 }
            ).pipe(
              Effect.map((columnsWithTasks) => ({
                board,
                columns: columnsWithTasks as Array<IbmKanbanColumn & { tasks: IbmTask[] }>,
              }))
            )
          )
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listBoard')
      }))
    )
  }

  addColumn(data: KanbanColumnCreateInput): Effect.Effect<IbmKanbanColumn, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::addColumn'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) =>
        this.kanbanColumnService.addColumn(payload).pipe(
          Effect.mapError((cause) => XfErrorFactory.createFailed({ stage, operation: 'kanbanColumnService.addColumn', cause }))
        )
      )
    )
  }

  updateColumn(id: string, patch: Partial<IbmKanbanColumn>): Effect.Effect<IbmKanbanColumn, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::updateColumn'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: kanbanColumnZodSchemaInsert.partial().strict(),
          stage,
          operation: 'KanbanBoardService::updateColumn.kanbanColumnZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap(() =>
        this.kanbanColumnService.updateColumn(id, patch).pipe(
          Effect.mapError((cause) => XfErrorFactory.upsertFailed({ stage, operation: 'kanbanColumnService.updateColumn', cause }))
        )
      )
    )
  }

  setColumnWipLimit(id: string, wipLimit?: number | null): Effect.Effect<IbmKanbanColumn, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::setColumnWipLimit'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap(() =>
        this.kanbanColumnService.setColumnWipLimit(id, wipLimit).pipe(
          Effect.mapError((cause) => XfErrorFactory.upsertFailed({ stage, operation: 'kanbanColumnService.setColumnWipLimit', cause }))
        )
      )
    )
  }

  reorderColumns(boardId: string, orderedColumnIds: string[]): Effect.Effect<number, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::reorderColumns'
    return pipe(
      validateInput(boardId, 'boardId', { stage }),
      Effect.flatMap(() =>
        this.kanbanColumnService.reorderColumns(boardId, orderedColumnIds).pipe(
          Effect.mapError((cause) => XfErrorFactory.upsertFailed({ stage, operation: 'kanbanColumnService.reorderColumns', cause }))
        )
      )
    )
  }

  moveTaskToColumn(taskId: string, toColumnId: string, toPosition?: number): Effect.Effect<IbmTask, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::moveTaskToColumn'
    return pipe(
      validateInput(taskId, 'taskId', { stage }),
      Effect.flatMap(() =>
        this.taskService.moveTaskToColumn(taskId, toColumnId, toPosition).pipe(
          Effect.mapError((cause) => XfErrorFactory.upsertFailed({ stage, operation: 'taskService.moveTaskToColumn', cause }))
        )
      )
    )
  }

  reorderTasksInColumn(columnId: string, orderedTaskIds: string[]): Effect.Effect<number, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::reorderTasksInColumn'
    return pipe(
      validateInput(columnId, 'columnId', { stage }),
      Effect.flatMap(() =>
        this.taskService.reorderTasksInColumn(columnId, orderedTaskIds).pipe(
          Effect.mapError((cause) => XfErrorFactory.upsertFailed({ stage, operation: 'taskService.reorderTasksInColumn', cause }))
        )
      )
    )
  }
}
