import { IRepositoryPortChatRoomBinding } from '../ports/repository-ports/index.js'
import { ChatRoomBindingDrizzleRepo, ChatRoomBindingDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryChatRoomBinding = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortChatRoomBinding>({
  moduleName: 'RepositoryFactoryChatRoomBinding',
  pgRepo: ChatRoomBindingDrizzleRepo,
  sqliteRepo: ChatRoomBindingDrizzleSqliteRepo,
})
