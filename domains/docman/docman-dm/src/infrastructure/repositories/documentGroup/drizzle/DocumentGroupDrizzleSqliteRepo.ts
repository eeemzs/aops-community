import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmDocumentGroup } from '../../../../domain/models/index.js'
import { IRepositoryPortDocumentGroup } from '../../../../application/ports/repository-ports/index.js'
import { IdbDocumentGroupDrizzleSqlite, documentGroupTableSqlite } from '../../../db/documentGroup/drizzle/drizzle.schema.documentGroup.sqlite.js'
import { mapperDocumentGroupDrizzle } from '../../../db/documentGroup/drizzle/drizzle.mapper.documentGroup.js'

export class DocumentGroupDrizzleSqliteRepo
  extends DraBaseSqlite<IbmDocumentGroup, IdbDocumentGroupDrizzleSqlite, typeof documentGroupTableSqlite>
  implements IRepositoryPortDocumentGroup
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(documentGroupTableSqlite, { mapper: mapperDocumentGroupDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
