import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { KanbanTaskServiceError } from '../../errors/KanbanTaskServiceError.js'
import { IbmKanbanTask, IbmKanbanTaskInsert } from '../../../domain/models/index.js'

export type KanbanTaskCreateInput = Omit<IbmKanbanTaskInsert, 'position'> & {
  position?: number
}

export type KanbanTaskCopyInput = {
  boardColumnId?: string
  sprintId?: string | null
  title?: string
  description?: string | null
  position?: number
}

export interface IKanbanTaskServicePort {
  getById(id: string, options?: DbQueryOptions<IbmKanbanTask>): Effect.Effect<IbmKanbanTask | null, KanbanTaskServiceError>
  create(data: IbmKanbanTaskInsert): Effect.Effect<IbmKanbanTask, KanbanTaskServiceError>
  createTask(input: KanbanTaskCreateInput): Effect.Effect<IbmKanbanTask, KanbanTaskServiceError>
  copyTask(id: string, input: KanbanTaskCopyInput): Effect.Effect<IbmKanbanTask, KanbanTaskServiceError>
  updateTask(id: string, patch: Partial<IbmKanbanTask>): Effect.Effect<IbmKanbanTask, KanbanTaskServiceError>
  listTasks(filter?: Partial<IbmKanbanTask>, options?: DbQueryOptions<IbmKanbanTask>): Effect.Effect<IbmKanbanTask[], KanbanTaskServiceError>
  moveTaskToColumn(taskId: string, toBoardColumnId: string, toPosition?: number): Effect.Effect<IbmKanbanTask, KanbanTaskServiceError>
  reorderTasksInColumn(boardColumnId: string, orderedTaskIds: string[]): Effect.Effect<number, KanbanTaskServiceError>
  removeTask(id: string): Effect.Effect<void, KanbanTaskServiceError>
  //==> custom-methods
  //<==//
}

export interface IKanbanTaskLookupPort {
  getById(id: string): Effect.Effect<IbmKanbanTask | null, KanbanTaskServiceError>
}
