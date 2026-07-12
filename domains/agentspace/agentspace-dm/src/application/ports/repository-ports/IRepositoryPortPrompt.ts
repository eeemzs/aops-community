import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmPrompt } from '../../../domain/models/index.js'
import { IdbPromptDrizzle } from '../../../infrastructure/db/prompt/drizzle/drizzle.schema.prompt.js'

/**
 * Repository port for Prompt
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortPrompt extends IRepositoryPortBaseCrud<IbmPrompt, IdbPromptDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmPrompt>): import('effect').Effect<IbmPrompt | null, RepositoryError>
  //<==//
}


