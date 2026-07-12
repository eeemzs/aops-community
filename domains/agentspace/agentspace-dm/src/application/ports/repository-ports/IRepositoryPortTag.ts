import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmTag } from '../../../domain/models/index.js'
import { IdbTagDrizzle } from '../../../infrastructure/db/tag/drizzle/drizzle.schema.tag.js'

/**
 * Repository port for Tag
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortTag extends IRepositoryPortBaseCrud<IbmTag, IdbTagDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmTag>): import('effect').Effect<IbmTag | null, RepositoryError>
  //<==//
}

