import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmCodexChatSetting } from '../../../../domain/models/index.js'
import { IRepositoryPortCodexChatSetting } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbCodexChatSettingDrizzle,
  codexChatSettingTable,
} from '../../../db/codexChatSetting/drizzle/drizzle.schema.codexChatSetting.js'
import { mapperCodexChatSettingDrizzle } from '../../../db/codexChatSetting/drizzle/drizzle.mapper.codexChatSetting.js'

export class CodexChatSettingDrizzleRepo
  extends DraBase<IbmCodexChatSetting, IdbCodexChatSettingDrizzle, typeof codexChatSettingTable>
  implements IRepositoryPortCodexChatSetting
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(codexChatSettingTable, {
      mapper: mapperCodexChatSettingDrizzle,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}

