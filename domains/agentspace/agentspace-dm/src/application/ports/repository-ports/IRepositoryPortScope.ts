import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmScope } from '../../../domain/models/index.js'
import { IdbScopeDrizzle } from '../../../infrastructure/db/scope/drizzle/drizzle.schema.scope.js'

export interface IRepositoryPortScope extends IRepositoryPortBaseCrud<IbmScope, IdbScopeDrizzle, RepositoryError> {}
