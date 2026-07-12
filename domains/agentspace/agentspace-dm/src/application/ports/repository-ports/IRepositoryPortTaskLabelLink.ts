import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmTaskLabelLink } from '../../../domain/models/index.js'
import { IdbTaskLabelLinkDrizzle } from '../../../infrastructure/db/taskLabelLink/drizzle/drizzle.schema.taskLabelLink.js'

export interface IRepositoryPortTaskLabelLink
  extends IRepositoryPortBaseCrud<IbmTaskLabelLink, IdbTaskLabelLinkDrizzle, RepositoryError> {}
