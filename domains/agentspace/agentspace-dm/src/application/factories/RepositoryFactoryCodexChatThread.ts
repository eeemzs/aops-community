import { IRepositoryPortCodexChatThread } from '../ports/repository-ports/index.js'
import { CodexChatThreadDrizzleRepo, CodexChatThreadDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryCodexChatThread = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortCodexChatThread>({
  moduleName: 'RepositoryFactoryCodexChatThread',
  pgRepo: CodexChatThreadDrizzleRepo,
  sqliteRepo: CodexChatThreadDrizzleSqliteRepo,
})
