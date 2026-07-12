import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmDocumentVersion } from '../../../../domain/models/index.js'
import { IRepositoryPortDocumentVersion } from '../../../../application/ports/repository-ports/index.js'
import { IdbDocumentVersionDrizzleSqlite, documentVersionTableSqlite } from '../../../db/documentVersion/drizzle/drizzle.schema.documentVersion.sqlite.js'
import { mapperDocumentVersionDrizzle } from '../../../db/documentVersion/drizzle/drizzle.mapper.documentVersion.js'

export class DocumentVersionDrizzleSqliteRepo
  extends DraBaseSqlite<IbmDocumentVersion, IdbDocumentVersionDrizzleSqlite, typeof documentVersionTableSqlite>
  implements IRepositoryPortDocumentVersion
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(documentVersionTableSqlite, { mapper: mapperDocumentVersionDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
