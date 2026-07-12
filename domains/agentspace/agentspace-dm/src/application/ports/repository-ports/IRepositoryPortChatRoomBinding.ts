import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmChatRoomBinding } from '../../../domain/models/index.js'
import { IdbChatRoomBindingDrizzle } from '../../../infrastructure/db/chatRoomBinding/drizzle/drizzle.schema.chatRoomBinding.js'

/**
 * Repository port for ChatRoomBinding.
 */
export interface IRepositoryPortChatRoomBinding
  extends IRepositoryPortBaseCrud<IbmChatRoomBinding, IdbChatRoomBindingDrizzle, RepositoryError> {
  // Domain-specific methods live in ChatService for lean v1.
}
