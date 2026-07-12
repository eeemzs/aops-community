import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmChatRoomMember } from '../../../domain/models/index.js'
import { IdbChatRoomMemberDrizzle } from '../../../infrastructure/db/chatRoomMember/drizzle/drizzle.schema.chatRoomMember.js'

/**
 * Repository port for ChatRoomMember.
 */
export interface IRepositoryPortChatRoomMember
  extends IRepositoryPortBaseCrud<IbmChatRoomMember, IdbChatRoomMemberDrizzle, RepositoryError> {
  // Domain-specific methods live in ChatService for lean v1.
}
