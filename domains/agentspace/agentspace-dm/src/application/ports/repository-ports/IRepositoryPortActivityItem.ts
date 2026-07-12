import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmActivityItem } from '../../../domain/models/index.js'
import { IdbActivityItemDrizzle } from '../../../infrastructure/db/activityItem/drizzle/drizzle.schema.activityItem.js'

export interface IRepositoryPortActivityItem extends IRepositoryPortBaseCrud<IbmActivityItem, IdbActivityItemDrizzle, RepositoryError> {}
