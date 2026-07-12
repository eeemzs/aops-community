import { IRepositoryPortAssetVersion } from '../ports/repository-ports/index.js'
import { AssetVersionDrizzleRepo, AssetVersionDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryAssetVersion = createDocmanDrizzleRepositoryFactory<IRepositoryPortAssetVersion>({
  moduleName: 'RepositoryFactoryAssetVersion',
  pgRepo: AssetVersionDrizzleRepo,
  sqliteRepo: AssetVersionDrizzleSqliteRepo,
})
