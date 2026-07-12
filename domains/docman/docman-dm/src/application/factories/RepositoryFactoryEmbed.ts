import { IRepositoryPortEmbed } from '../ports/repository-ports/index.js'
import { EmbedDrizzleRepo, EmbedDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryEmbed = createDocmanDrizzleRepositoryFactory<IRepositoryPortEmbed>({
  moduleName: 'RepositoryFactoryEmbed',
  pgRepo: EmbedDrizzleRepo,
  sqliteRepo: EmbedDrizzleSqliteRepo,
})
