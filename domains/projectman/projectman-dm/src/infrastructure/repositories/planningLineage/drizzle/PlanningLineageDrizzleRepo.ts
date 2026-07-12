import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPlanningLineage } from '../../../../domain/models/index.js'
import { IRepositoryPortPlanningLineage } from '../../../../application/ports/repository-ports/index.js'
import { IdbPlanningLineageDrizzle, planningLineageTable } from '../../../db/planningLineage/drizzle/drizzle.schema.planningLineage.js'
import { mapperPlanningLineageDrizzle } from '../../../db/planningLineage/drizzle/drizzle.mapper.planningLineage.js'

export class PlanningLineageDrizzleRepo extends DraBase<IbmPlanningLineage, IdbPlanningLineageDrizzle, typeof planningLineageTable> implements IRepositoryPortPlanningLineage {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(planningLineageTable, { mapper: mapperPlanningLineageDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
