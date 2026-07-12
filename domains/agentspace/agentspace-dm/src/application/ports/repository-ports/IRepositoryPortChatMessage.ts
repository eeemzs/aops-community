import type { DbQueryOptions, RepositoryError } from '@aopslab/xf-db'
import { Effect } from 'effect'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmChatMessage } from '../../../domain/models/index.js'
import { IdbChatMessageDrizzle } from '../../../infrastructure/db/chatMessage/drizzle/drizzle.schema.chatMessage.js'

/**
 * Repository port for ChatMessage.
 */
export interface IRepositoryPortChatMessage
  extends IRepositoryPortBaseCrud<IbmChatMessage, IdbChatMessageDrizzle, RepositoryError> {
  listRoomMessagesAfterSeq(
    roomId: string,
    afterSeq: number,
    options?: DbQueryOptions<IbmChatMessage>
  ): Effect.Effect<IbmChatMessage[], RepositoryError>
}
