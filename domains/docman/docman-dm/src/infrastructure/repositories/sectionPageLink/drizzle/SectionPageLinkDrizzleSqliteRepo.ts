import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSectionPageLink } from '../../../../domain/models/index.js'
import { IRepositoryPortSectionPageLink } from '../../../../application/ports/repository-ports/index.js'
import { IdbSectionPageLinkDrizzleSqlite, sectionPageLinkTableSqlite } from '../../../db/sectionPageLink/drizzle/drizzle.schema.sectionPageLink.sqlite.js'
import { mapperSectionPageLinkDrizzle } from '../../../db/sectionPageLink/drizzle/drizzle.mapper.sectionPageLink.js'

export class SectionPageLinkDrizzleSqliteRepo
  extends DraBaseSqlite<IbmSectionPageLink, IdbSectionPageLinkDrizzleSqlite, typeof sectionPageLinkTableSqlite>
  implements IRepositoryPortSectionPageLink
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(sectionPageLinkTableSqlite, { mapper: mapperSectionPageLinkDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
