import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmAgentProfile } from '../../../domain/models/index.js'
import { IdbAgentProfileDrizzle } from '../../../infrastructure/db/agentProfile/drizzle/drizzle.schema.agentProfile.js'

export interface IRepositoryPortAgentProfile extends IRepositoryPortBaseCrud<IbmAgentProfile, IdbAgentProfileDrizzle, RepositoryError> {
  // custom methods can be added here when needed
}
