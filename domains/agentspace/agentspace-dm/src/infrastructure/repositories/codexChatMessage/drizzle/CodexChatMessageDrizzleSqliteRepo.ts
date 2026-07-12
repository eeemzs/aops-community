import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmCodexChatMessage } from '../../../../domain/models/index.js'
import { IRepositoryPortCodexChatMessage } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbCodexChatMessageDrizzleSqlite,
  codexChatMessageTableSqlite,
} from '../../../db/codexChatMessage/drizzle/drizzle.schema.codexChatMessage.sqlite.js'
import { mapperCodexChatMessageDrizzle } from '../../../db/codexChatMessage/drizzle/drizzle.mapper.codexChatMessage.js'

export class CodexChatMessageDrizzleSqliteRepo
  extends DraBaseSqlite<IbmCodexChatMessage, IdbCodexChatMessageDrizzleSqlite, typeof codexChatMessageTableSqlite>
  implements IRepositoryPortCodexChatMessage
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(codexChatMessageTableSqlite, {
      mapper: mapperCodexChatMessageDrizzle as any,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
