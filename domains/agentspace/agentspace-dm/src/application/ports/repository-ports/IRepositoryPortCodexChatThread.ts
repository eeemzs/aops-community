import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmCodexChatThread } from '../../../domain/models/index.js'
import { IdbCodexChatThreadDrizzle } from '../../../infrastructure/db/codexChatThread/drizzle/drizzle.schema.codexChatThread.js'

/**
 * Repository port for CodexChatThread
 */
export interface IRepositoryPortCodexChatThread
  extends IRepositoryPortBaseCrud<IbmCodexChatThread, IdbCodexChatThreadDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here.
  //<==//
}


