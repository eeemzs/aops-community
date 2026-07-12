import { Effect } from 'effect'
import { TaskCommentServiceError } from '../../errors/TaskCommentServiceError.js'
import { IbmTaskComment, IbmTaskCommentInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface ITaskCommentServicePort {
  getById(id: string, options?: DbQueryOptions<IbmTaskComment>): Effect.Effect<IbmTaskComment | null, TaskCommentServiceError>
  create(data: IbmTaskCommentInsert): Effect.Effect<IbmTaskComment, TaskCommentServiceError>
  listByTask(taskId: string, options?: DbQueryOptions<IbmTaskComment>): Effect.Effect<IbmTaskComment[], TaskCommentServiceError>
  listByProject(projectId: string, options?: DbQueryOptions<IbmTaskComment>): Effect.Effect<IbmTaskComment[], TaskCommentServiceError>
}

export interface ITaskCommentLookupPort {
  getById(id: string): Effect.Effect<IbmTaskComment | null, TaskCommentServiceError>
}
