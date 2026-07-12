import { IRepositoryPortChatMessage } from '../ports/repository-ports/index.js'
import { ChatMessageDrizzleRepo, ChatMessageDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryChatMessage = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortChatMessage>({
  moduleName: 'RepositoryFactoryChatMessage',
  pgRepo: ChatMessageDrizzleRepo,
  sqliteRepo: ChatMessageDrizzleSqliteRepo,
})
