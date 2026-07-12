import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmTaskChecklistItem } from '../../../domain/models/index.js'
import { IdbTaskChecklistItemDrizzle } from '../../../infrastructure/db/taskChecklistItem/drizzle/drizzle.schema.taskChecklistItem.js'

export interface IRepositoryPortTaskChecklistItem
  extends IRepositoryPortBaseCrud<IbmTaskChecklistItem, IdbTaskChecklistItemDrizzle, RepositoryError> {}
