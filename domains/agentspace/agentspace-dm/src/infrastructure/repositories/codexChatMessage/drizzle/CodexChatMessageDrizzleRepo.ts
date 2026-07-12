import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmCodexChatMessage } from '../../../../domain/models/index.js'
import { IRepositoryPortCodexChatMessage } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbCodexChatMessageDrizzle,
  codexChatMessageTable,
} from '../../../db/codexChatMessage/drizzle/drizzle.schema.codexChatMessage.js'
import { mapperCodexChatMessageDrizzle } from '../../../db/codexChatMessage/drizzle/drizzle.mapper.codexChatMessage.js'

export class CodexChatMessageDrizzleRepo
  extends DraBase<IbmCodexChatMessage, IdbCodexChatMessageDrizzle, typeof codexChatMessageTable>
  implements IRepositoryPortCodexChatMessage
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(codexChatMessageTable, {
      mapper: mapperCodexChatMessageDrizzle,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}

