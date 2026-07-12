import { IRepositoryPortMission } from '../ports/repository-ports/index.js'
import { MissionDrizzleRepo, MissionDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryMission = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortMission>({
  moduleName: 'RepositoryFactoryMission',
  pgRepo: MissionDrizzleRepo,
  sqliteRepo: MissionDrizzleSqliteRepo,
})
