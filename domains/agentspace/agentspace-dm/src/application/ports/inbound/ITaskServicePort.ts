import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { TaskServiceError } from '../../errors/TaskServiceError.js'
import {
  IbmTask,
  IbmTaskInsert,
  IbmTaskChecklistItem,
  IbmTaskChecklistItemInsert,
  IbmTaskComment,
  IbmTaskCommentInsert,
  IbmTaskLabel,
  IbmTaskLabelInsert,
  IbmTaskLabelLink,
  IbmTaskRelation,
  IbmTaskRelationInsert,
} from '../../../domain/models/index.js'

export type TaskCreateInput = Omit<IbmTaskInsert, 'position'> & { position?: number }
export type TaskLabelCreateInput = Omit<IbmTaskLabelInsert, 'position'> & { position?: number }
export type TaskChecklistItemCreateInput = Omit<IbmTaskChecklistItemInsert, 'scopeId' | 'position' | 'isDone'> & {
  scopeId?: string
  position?: number
  isDone?: boolean
}
export type TaskRelationCreateInput = Omit<IbmTaskRelationInsert, 'scopeId'> & { scopeId?: string }

export type TaskChecklistStats = {
  total: number
  completed: number
  remaining: number
}

export type TaskRelationSummary = {
  blocking: number
  blockedBy: number
  precedes: number
  precededBy: number
  related: number
}

export type TaskRecord = IbmTask & {
  labels?: IbmTaskLabel[]
  checklistStats?: TaskChecklistStats
  commentCount?: number
  relationSummary?: TaskRelationSummary
}

export interface ITaskServicePort {
  getById(id: string, options?: DbQueryOptions<IbmTask>): Effect.Effect<TaskRecord | null, TaskServiceError>
  create(data: IbmTaskInsert): Effect.Effect<IbmTask, TaskServiceError>
  getTask(id: string, options?: DbQueryOptions<IbmTask>): Effect.Effect<TaskRecord | null, TaskServiceError>
  createTask(data: TaskCreateInput): Effect.Effect<TaskRecord, TaskServiceError>
  updateTask(id: string, patch: Partial<IbmTask>): Effect.Effect<TaskRecord, TaskServiceError>
  setTaskPriority(id: string, priority: number | null): Effect.Effect<TaskRecord, TaskServiceError>
  setTaskAssignee(id: string, assignee: string | null): Effect.Effect<TaskRecord, TaskServiceError>
  setTaskDueDate(id: string, dueAt: Date | null): Effect.Effect<TaskRecord, TaskServiceError>
  setTaskParent(id: string, parentTaskId: string | null): Effect.Effect<TaskRecord, TaskServiceError>
  linkTaskToSprint(id: string, sprintId: string): Effect.Effect<TaskRecord, TaskServiceError>
  unlinkTaskFromSprint(id: string): Effect.Effect<TaskRecord, TaskServiceError>
  reorderTask(taskId: string, toPosition: number): Effect.Effect<TaskRecord, TaskServiceError>
  moveTaskToColumn(taskId: string, toColumnId: string, toPosition?: number): Effect.Effect<TaskRecord, TaskServiceError>
  reorderTasksInColumn(columnId: string, orderedTaskIds: string[]): Effect.Effect<number, TaskServiceError>
  deleteTask(id: string): Effect.Effect<number, TaskServiceError>
  addTaskComment(data: IbmTaskCommentInsert): Effect.Effect<IbmTaskComment, TaskServiceError>
  listTaskComments(taskId: string, options?: DbQueryOptions<IbmTaskComment>): Effect.Effect<IbmTaskComment[], TaskServiceError>
  createTaskLabel(data: TaskLabelCreateInput): Effect.Effect<IbmTaskLabel, TaskServiceError>
  deleteTaskLabel(id: string): Effect.Effect<number, TaskServiceError>
  listTaskLabels(scopeId: string, options?: DbQueryOptions<IbmTaskLabel>): Effect.Effect<IbmTaskLabel[], TaskServiceError>
  listLabelsForTask(taskId: string): Effect.Effect<IbmTaskLabel[], TaskServiceError>
  setTaskLabel(taskId: string, labelId: string): Effect.Effect<IbmTaskLabelLink, TaskServiceError>
  unsetTaskLabel(taskId: string, labelId: string): Effect.Effect<number, TaskServiceError>
  addChecklistItem(data: TaskChecklistItemCreateInput): Effect.Effect<IbmTaskChecklistItem, TaskServiceError>
  toggleChecklistItem(id: string, isDone: boolean): Effect.Effect<IbmTaskChecklistItem, TaskServiceError>
  removeChecklistItem(id: string): Effect.Effect<number, TaskServiceError>
  reorderChecklistItems(taskId: string, orderedItemIds: string[]): Effect.Effect<number, TaskServiceError>
  listChecklistItems(taskId: string, options?: DbQueryOptions<IbmTaskChecklistItem>): Effect.Effect<IbmTaskChecklistItem[], TaskServiceError>
  addTaskRelation(data: TaskRelationCreateInput): Effect.Effect<IbmTaskRelation, TaskServiceError>
  removeTaskRelation(id: string): Effect.Effect<number, TaskServiceError>
  listTaskRelations(taskId: string, options?: DbQueryOptions<IbmTaskRelation>): Effect.Effect<IbmTaskRelation[], TaskServiceError>
  searchTasks(filter?: Partial<IbmTask>, options?: DbQueryOptions<IbmTask>): Effect.Effect<TaskRecord[], TaskServiceError>
}

export interface ITaskLookupPort {
  getById(id: string): Effect.Effect<TaskRecord | null, TaskServiceError>
}
