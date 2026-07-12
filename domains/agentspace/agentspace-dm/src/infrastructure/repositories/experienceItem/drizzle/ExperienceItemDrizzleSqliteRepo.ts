import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmExperienceItem } from '../../../../domain/models/index.js'
import { IRepositoryPortExperienceItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbExperienceItemDrizzleSqlite, experienceItemTableSqlite } from '../../../db/experienceItem/drizzle/drizzle.schema.experienceItem.sqlite.js'
import { mapperExperienceItemDrizzle } from '../../../db/experienceItem/drizzle/drizzle.mapper.experienceItem.js'

export class ExperienceItemDrizzleSqliteRepo extends DraBaseSqlite<IbmExperienceItem, IdbExperienceItemDrizzleSqlite, typeof experienceItemTableSqlite> implements IRepositoryPortExperienceItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(experienceItemTableSqlite, { mapper: mapperExperienceItemDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
