import { Effect } from 'effect'
import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmChatRoom } from '../../../domain/models/index.js'
import { IdbChatRoomDrizzle } from '../../../infrastructure/db/chatRoom/drizzle/drizzle.schema.chatRoom.js'

/**
 * Repository port for ChatRoom.
 */
export interface IRepositoryPortChatRoom
  extends IRepositoryPortBaseCrud<IbmChatRoom, IdbChatRoomDrizzle, RepositoryError> {
  allocateNextSeq(roomId: string, patch?: Partial<IbmChatRoom>): Effect.Effect<IbmChatRoom, RepositoryError>
}
