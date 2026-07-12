import { IRepositoryPortCodexChatMessage } from '../ports/repository-ports/index.js'
import { CodexChatMessageDrizzleRepo, CodexChatMessageDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryCodexChatMessage = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortCodexChatMessage>({
  moduleName: 'RepositoryFactoryCodexChatMessage',
  pgRepo: CodexChatMessageDrizzleRepo,
  sqliteRepo: CodexChatMessageDrizzleSqliteRepo,
})
