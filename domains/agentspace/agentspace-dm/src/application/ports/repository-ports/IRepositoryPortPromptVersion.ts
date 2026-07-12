import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmPromptVersion } from '../../../domain/models/index.js'
import { IdbPromptVersionDrizzle } from '../../../infrastructure/db/promptVersion/drizzle/drizzle.schema.promptVersion.js'

/**
 * Repository port for PromptVersion
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortPromptVersion extends IRepositoryPortBaseCrud<IbmPromptVersion, IdbPromptVersionDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmPromptVersion>): import('effect').Effect<IbmPromptVersion | null, RepositoryError>
  //<==//
}


