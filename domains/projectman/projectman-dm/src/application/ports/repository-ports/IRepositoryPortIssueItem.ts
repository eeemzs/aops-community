import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmIssueItem } from '../../../domain/models/index.js'
import { IdbIssueItemDrizzle } from '../../../infrastructure/db/issueItem/drizzle/drizzle.schema.issueItem.js'

/**
 * Repository port for IssueItem
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortIssueItem extends IRepositoryBaseCrud<IbmIssueItem, IdbIssueItemDrizzle, RepositoryError> {
  //==> custom-methods
  //<==//
}
