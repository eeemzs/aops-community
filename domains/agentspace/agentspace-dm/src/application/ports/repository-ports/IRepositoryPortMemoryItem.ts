import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmMemoryItem } from '../../../domain/models/index.js'
import { IdbMemoryItemDrizzle } from '../../../infrastructure/db/memoryItem/drizzle/drizzle.schema.memoryItem.js'

/**
 * Repository port for MemoryItem
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortMemoryItem extends IRepositoryPortBaseCrud<IbmMemoryItem, IdbMemoryItemDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmMemoryItem>): import('effect').Effect<IbmMemoryItem | null, RepositoryError>
  //<==//
}


