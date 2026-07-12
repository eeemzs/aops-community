import { IRepositoryPortDocument } from '../ports/repository-ports/index.js'
import { DocumentDrizzleRepo, DocumentDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryDocument = createDocmanDrizzleRepositoryFactory<IRepositoryPortDocument>({
  moduleName: 'RepositoryFactoryDocument',
  pgRepo: DocumentDrizzleRepo,
  sqliteRepo: DocumentDrizzleSqliteRepo,
})
