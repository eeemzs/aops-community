import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmDocumentIndexEntry } from '../../../../domain/models/index.js'
import { IRepositoryPortDocumentIndexEntry } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbDocumentIndexEntryDrizzle,
  documentIndexEntryTable,
} from '../../../db/documentIndexEntry/drizzle/drizzle.schema.documentIndexEntry.js'
import { mapperDocumentIndexEntryDrizzle } from '../../../db/documentIndexEntry/drizzle/drizzle.mapper.documentIndexEntry.js'

export class DocumentIndexEntryDrizzleRepo
  extends DraBase<IbmDocumentIndexEntry, IdbDocumentIndexEntryDrizzle, typeof documentIndexEntryTable>
  implements IRepositoryPortDocumentIndexEntry
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(documentIndexEntryTable, {
      mapper: mapperDocumentIndexEntryDrizzle,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
