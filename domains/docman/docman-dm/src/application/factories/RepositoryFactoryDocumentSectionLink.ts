import { IRepositoryPortDocumentSectionLink } from '../ports/repository-ports/index.js'
import { DocumentSectionLinkDrizzleRepo, DocumentSectionLinkDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryDocumentSectionLink = createDocmanDrizzleRepositoryFactory<IRepositoryPortDocumentSectionLink>({
  moduleName: 'RepositoryFactoryDocumentSectionLink',
  pgRepo: DocumentSectionLinkDrizzleRepo,
  sqliteRepo: DocumentSectionLinkDrizzleSqliteRepo,
})
