import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmMission } from '../../../domain/models/index.js'
import { IdbMissionDrizzle } from '../../../infrastructure/db/mission/drizzle/drizzle.schema.mission.js'

/**
 * Repository port for Mission.
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortMission extends IRepositoryPortBaseCrud<IbmMission, IdbMissionDrizzle, RepositoryError> {}
