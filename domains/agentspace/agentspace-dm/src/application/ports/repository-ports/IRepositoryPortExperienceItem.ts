import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmExperienceItem } from '../../../domain/models/index.js'
import { IdbExperienceItemDrizzle } from '../../../infrastructure/db/experienceItem/drizzle/drizzle.schema.experienceItem.js'

export interface IRepositoryPortExperienceItem extends IRepositoryPortBaseCrud<IbmExperienceItem, IdbExperienceItemDrizzle, RepositoryError> {
  // custom methods can be added here when needed
}
