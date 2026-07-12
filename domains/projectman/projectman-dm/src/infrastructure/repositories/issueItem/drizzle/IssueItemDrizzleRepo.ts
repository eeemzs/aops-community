import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmIssueItem } from '../../../../domain/models/index.js'
import { IRepositoryPortIssueItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbIssueItemDrizzle, issueItemTable } from '../../../db/issueItem/drizzle/drizzle.schema.issueItem.js'
import { mapperIssueItemDrizzle } from '../../../db/issueItem/drizzle/drizzle.mapper.issueItem.js'

export class IssueItemDrizzleRepo extends DraBase<IbmIssueItem, IdbIssueItemDrizzle, typeof issueItemTable> implements IRepositoryPortIssueItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(issueItemTable, { mapper: mapperIssueItemDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  //<==//
}
