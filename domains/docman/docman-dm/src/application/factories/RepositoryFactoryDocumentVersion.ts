import { IRepositoryPortDocumentVersion } from '../ports/repository-ports/index.js'
import { DocumentVersionDrizzleRepo, DocumentVersionDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryDocumentVersion = createDocmanDrizzleRepositoryFactory<IRepositoryPortDocumentVersion>({
  moduleName: 'RepositoryFactoryDocumentVersion',
  pgRepo: DocumentVersionDrizzleRepo,
  sqliteRepo: DocumentVersionDrizzleSqliteRepo,
})
