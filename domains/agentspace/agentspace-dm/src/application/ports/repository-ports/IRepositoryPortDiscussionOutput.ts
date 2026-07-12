import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmDiscussionOutput } from '../../../domain/models/index.js'
import { IdbDiscussionOutputDrizzle } from '../../../infrastructure/db/discussionOutput/drizzle/drizzle.schema.discussionOutput.js'

/**
 * Repository port for DiscussionOutput.
 */
export interface IRepositoryPortDiscussionOutput
  extends IRepositoryPortBaseCrud<IbmDiscussionOutput, IdbDiscussionOutputDrizzle, RepositoryError> {}
