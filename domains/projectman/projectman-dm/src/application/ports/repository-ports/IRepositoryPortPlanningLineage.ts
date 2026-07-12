import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmPlanningLineage } from '../../../domain/models/index.js'
import { IdbPlanningLineageDrizzle } from '../../../infrastructure/db/planningLineage/drizzle/drizzle.schema.planningLineage.js'

/**
 * Repository port for PlanningLineage
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortPlanningLineage
  extends IRepositoryBaseCrud<IbmPlanningLineage, IdbPlanningLineageDrizzle, RepositoryError> {}
