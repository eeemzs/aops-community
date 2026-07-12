import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmHistory } from '../../../../domain/models/index.js'
import { IRepositoryPortHistory } from '../../../../application/ports/repository-ports/index.js'
import { IdbHistoryDrizzle, historyTable } from '../../../db/history/drizzle/drizzle.schema.history.js'
import { mapperHistoryDrizzle } from '../../../db/history/drizzle/drizzle.mapper.history.js'

export class HistoryDrizzleRepo extends DraBase<IbmHistory, IdbHistoryDrizzle, typeof historyTable> implements IRepositoryPortHistory {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(historyTable, { mapper: mapperHistoryDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  //<==//
}
