import { IRepositoryPortArtifactLink } from '../ports/repository-ports/index.js'
import { ArtifactLinkDrizzleRepo, ArtifactLinkDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryArtifactLink = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortArtifactLink>({
  moduleName: 'RepositoryFactoryArtifactLink',
  pgRepo: ArtifactLinkDrizzleRepo,
  sqliteRepo: ArtifactLinkDrizzleSqliteRepo,
})
