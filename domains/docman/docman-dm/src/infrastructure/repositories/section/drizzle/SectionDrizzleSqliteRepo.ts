import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSection } from '../../../../domain/models/index.js'
import { IRepositoryPortSection } from '../../../../application/ports/repository-ports/index.js'
import { IdbSectionDrizzleSqlite, sectionTableSqlite } from '../../../db/section/drizzle/drizzle.schema.section.sqlite.js'
import { mapperSectionDrizzle } from '../../../db/section/drizzle/drizzle.mapper.section.js'

export class SectionDrizzleSqliteRepo
  extends DraBaseSqlite<IbmSection, IdbSectionDrizzleSqlite, typeof sectionTableSqlite>
  implements IRepositoryPortSection
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(sectionTableSqlite, { mapper: mapperSectionDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
