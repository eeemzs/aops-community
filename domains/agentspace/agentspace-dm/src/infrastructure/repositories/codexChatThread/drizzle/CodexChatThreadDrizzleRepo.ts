import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmCodexChatThread } from '../../../../domain/models/index.js'
import { IRepositoryPortCodexChatThread } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbCodexChatThreadDrizzle,
  codexChatThreadTable,
} from '../../../db/codexChatThread/drizzle/drizzle.schema.codexChatThread.js'
import { mapperCodexChatThreadDrizzle } from '../../../db/codexChatThread/drizzle/drizzle.mapper.codexChatThread.js'

export class CodexChatThreadDrizzleRepo
  extends DraBase<IbmCodexChatThread, IdbCodexChatThreadDrizzle, typeof codexChatThreadTable>
  implements IRepositoryPortCodexChatThread
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(codexChatThreadTable, {
      mapper: mapperCodexChatThreadDrizzle,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}

