import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmTaskComment } from '../../../domain/models/index.js'
import { IdbTaskCommentDrizzle } from '../../../infrastructure/db/taskComment/drizzle/drizzle.schema.taskComment.js'

/**
 * Repository port for TaskComment
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortTaskComment extends IRepositoryPortBaseCrud<IbmTaskComment, IdbTaskCommentDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmTaskComment>): import('effect').Effect<IbmTaskComment | null, RepositoryError>
  //<==//
}


