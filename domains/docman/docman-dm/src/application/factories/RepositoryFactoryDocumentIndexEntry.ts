import { IRepositoryPortDocumentIndexEntry } from '../ports/repository-ports/index.js'
import { DocumentIndexEntryDrizzleRepo, DocumentIndexEntryDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryDocumentIndexEntry = createDocmanDrizzleRepositoryFactory<IRepositoryPortDocumentIndexEntry>({
  moduleName: 'RepositoryFactoryDocumentIndexEntry',
  pgRepo: DocumentIndexEntryDrizzleRepo,
  sqliteRepo: DocumentIndexEntryDrizzleSqliteRepo,
})
