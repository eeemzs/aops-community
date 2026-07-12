import { IRepositoryPortDocumentGroup } from '../ports/repository-ports/index.js'
import { DocumentGroupDrizzleRepo, DocumentGroupDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryDocumentGroup = createDocmanDrizzleRepositoryFactory<IRepositoryPortDocumentGroup>({
  moduleName: 'RepositoryFactoryDocumentGroup',
  pgRepo: DocumentGroupDrizzleRepo,
  sqliteRepo: DocumentGroupDrizzleSqliteRepo,
})
