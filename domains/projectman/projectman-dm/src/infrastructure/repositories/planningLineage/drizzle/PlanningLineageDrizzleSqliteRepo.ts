import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPlanningLineage } from '../../../../domain/models/index.js'
import { IRepositoryPortPlanningLineage } from '../../../../application/ports/repository-ports/index.js'
import { IdbPlanningLineageDrizzleSqlite, planningLineageTableSqlite } from '../../../db/planningLineage/drizzle/drizzle.schema.planningLineage.sqlite.js'
import { mapperPlanningLineageDrizzle } from '../../../db/planningLineage/drizzle/drizzle.mapper.planningLineage.js'

export class PlanningLineageDrizzleSqliteRepo extends DraBaseSqlite<IbmPlanningLineage, IdbPlanningLineageDrizzleSqlite, typeof planningLineageTableSqlite> implements IRepositoryPortPlanningLineage {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(planningLineageTableSqlite, { mapper: mapperPlanningLineageDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
