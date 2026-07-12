import { IRepositoryPortChatRoomMember } from '../ports/repository-ports/index.js'
import { ChatRoomMemberDrizzleRepo, ChatRoomMemberDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryChatRoomMember = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortChatRoomMember>({
  moduleName: 'RepositoryFactoryChatRoomMember',
  pgRepo: ChatRoomMemberDrizzleRepo,
  sqliteRepo: ChatRoomMemberDrizzleSqliteRepo,
})
