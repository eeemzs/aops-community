import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmTaskRelation } from '../../../domain/models/index.js'
import { IdbTaskRelationDrizzle } from '../../../infrastructure/db/taskRelation/drizzle/drizzle.schema.taskRelation.js'

export interface IRepositoryPortTaskRelation extends IRepositoryPortBaseCrud<IbmTaskRelation, IdbTaskRelationDrizzle, RepositoryError> {}
