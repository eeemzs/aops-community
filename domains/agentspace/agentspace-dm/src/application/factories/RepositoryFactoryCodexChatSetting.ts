import { IRepositoryPortCodexChatSetting } from '../ports/repository-ports/index.js'
import { CodexChatSettingDrizzleRepo, CodexChatSettingDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryCodexChatSetting = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortCodexChatSetting>({
  moduleName: 'RepositoryFactoryCodexChatSetting',
  pgRepo: CodexChatSettingDrizzleRepo,
  sqliteRepo: CodexChatSettingDrizzleSqliteRepo,
})
