import { IRepositoryPortArtifact } from '../ports/repository-ports/index.js'
import { ArtifactDrizzleRepo, ArtifactDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryArtifact = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortArtifact>({
  moduleName: 'RepositoryFactoryArtifact',
  pgRepo: ArtifactDrizzleRepo,
  sqliteRepo: ArtifactDrizzleSqliteRepo,
})
