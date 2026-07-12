import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmHistory } from '../../../domain/models/index.js'
import { IdbHistoryDrizzle } from '../../../infrastructure/db/history/drizzle/drizzle.schema.history.js'

/**
 * Repository port for History
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortHistory extends IRepositoryBaseCrud<IbmHistory, IdbHistoryDrizzle, RepositoryError> {
  //==> custom-methods
  //<==//
}
