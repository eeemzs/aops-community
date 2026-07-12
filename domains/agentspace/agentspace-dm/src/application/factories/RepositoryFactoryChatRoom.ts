import { IRepositoryPortChatRoom } from '../ports/repository-ports/index.js'
import { ChatRoomDrizzleRepo, ChatRoomDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryChatRoom = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortChatRoom>({
  moduleName: 'RepositoryFactoryChatRoom',
  pgRepo: ChatRoomDrizzleRepo,
  sqliteRepo: ChatRoomDrizzleSqliteRepo,
})
