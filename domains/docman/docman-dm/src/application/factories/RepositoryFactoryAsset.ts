import { IRepositoryPortAsset } from '../ports/repository-ports/index.js'
import { AssetDrizzleRepo, AssetDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryAsset = createDocmanDrizzleRepositoryFactory<IRepositoryPortAsset>({
  moduleName: 'RepositoryFactoryAsset',
  pgRepo: AssetDrizzleRepo,
  sqliteRepo: AssetDrizzleSqliteRepo,
})
