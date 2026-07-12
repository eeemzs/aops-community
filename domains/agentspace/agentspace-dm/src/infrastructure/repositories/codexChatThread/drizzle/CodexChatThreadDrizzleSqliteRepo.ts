import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmCodexChatThread } from '../../../../domain/models/index.js'
import { IRepositoryPortCodexChatThread } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbCodexChatThreadDrizzleSqlite,
  codexChatThreadTableSqlite,
} from '../../../db/codexChatThread/drizzle/drizzle.schema.codexChatThread.sqlite.js'
import { mapperCodexChatThreadDrizzle } from '../../../db/codexChatThread/drizzle/drizzle.mapper.codexChatThread.js'

export class CodexChatThreadDrizzleSqliteRepo
  extends DraBaseSqlite<IbmCodexChatThread, IdbCodexChatThreadDrizzleSqlite, typeof codexChatThreadTableSqlite>
  implements IRepositoryPortCodexChatThread
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(codexChatThreadTableSqlite, {
      mapper: mapperCodexChatThreadDrizzle as any,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
