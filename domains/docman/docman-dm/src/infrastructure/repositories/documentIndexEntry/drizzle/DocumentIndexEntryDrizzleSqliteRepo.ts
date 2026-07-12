import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmDocumentIndexEntry } from '../../../../domain/models/index.js'
import { IRepositoryPortDocumentIndexEntry } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbDocumentIndexEntryDrizzleSqlite,
  documentIndexEntryTableSqlite,
} from '../../../db/documentIndexEntry/drizzle/drizzle.schema.documentIndexEntry.sqlite.js'
import { mapperDocumentIndexEntryDrizzle } from '../../../db/documentIndexEntry/drizzle/drizzle.mapper.documentIndexEntry.js'

export class DocumentIndexEntryDrizzleSqliteRepo
  extends DraBaseSqlite<IbmDocumentIndexEntry, IdbDocumentIndexEntryDrizzleSqlite, typeof documentIndexEntryTableSqlite>
  implements IRepositoryPortDocumentIndexEntry
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(documentIndexEntryTableSqlite, {
      mapper: mapperDocumentIndexEntryDrizzle as any,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
