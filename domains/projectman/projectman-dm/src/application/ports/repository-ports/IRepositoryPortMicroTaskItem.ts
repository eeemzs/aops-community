import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmMicroTaskItem } from '../../../domain/models/index.js'
import { IdbMicroTaskItemDrizzle } from '../../../infrastructure/db/microTaskItem/drizzle/drizzle.schema.microTaskItem.js'

/**
 * Repository port for MicroTaskItem
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortMicroTaskItem extends IRepositoryBaseCrud<IbmMicroTaskItem, IdbMicroTaskItemDrizzle, RepositoryError> {
  //==> custom-methods
  //<==//
}
