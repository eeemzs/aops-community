import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmDocumentIndexEntry } from '../../../domain/models/index.js'
import { IdbDocumentIndexEntryDrizzle } from '../../../infrastructure/db/documentIndexEntry/drizzle/drizzle.schema.documentIndexEntry.js'

export interface IRepositoryPortDocumentIndexEntry
  extends IRepositoryBaseCrud<IbmDocumentIndexEntry, IdbDocumentIndexEntryDrizzle, RepositoryError> {}
