import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmCodexChatMessage } from '../../../domain/models/index.js'
import { IdbCodexChatMessageDrizzle } from '../../../infrastructure/db/codexChatMessage/drizzle/drizzle.schema.codexChatMessage.js'

/**
 * Repository port for CodexChatMessage
 */
export interface IRepositoryPortCodexChatMessage
  extends IRepositoryPortBaseCrud<IbmCodexChatMessage, IdbCodexChatMessageDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here.
  //<==//
}


