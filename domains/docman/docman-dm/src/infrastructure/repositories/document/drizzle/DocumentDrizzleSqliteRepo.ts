import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmDocument } from '../../../../domain/models/index.js'
import { IRepositoryPortDocument } from '../../../../application/ports/repository-ports/index.js'
import { IdbDocumentDrizzleSqlite, documentTableSqlite } from '../../../db/document/drizzle/drizzle.schema.document.sqlite.js'
import { mapperDocumentDrizzle } from '../../../db/document/drizzle/drizzle.mapper.document.js'

export class DocumentDrizzleSqliteRepo
  extends DraBaseSqlite<IbmDocument, IdbDocumentDrizzleSqlite, typeof documentTableSqlite>
  implements IRepositoryPortDocument
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(documentTableSqlite, { mapper: mapperDocumentDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
