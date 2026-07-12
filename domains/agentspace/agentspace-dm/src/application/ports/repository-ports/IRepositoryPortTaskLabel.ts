import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmTaskLabel } from '../../../domain/models/index.js'
import { IdbTaskLabelDrizzle } from '../../../infrastructure/db/taskLabel/drizzle/drizzle.schema.taskLabel.js'

export interface IRepositoryPortTaskLabel extends IRepositoryPortBaseCrud<IbmTaskLabel, IdbTaskLabelDrizzle, RepositoryError> {}
