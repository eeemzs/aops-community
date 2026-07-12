import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmCodexChatSetting } from '../../../../domain/models/index.js'
import { IRepositoryPortCodexChatSetting } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbCodexChatSettingDrizzleSqlite,
  codexChatSettingTableSqlite,
} from '../../../db/codexChatSetting/drizzle/drizzle.schema.codexChatSetting.sqlite.js'
import { mapperCodexChatSettingDrizzle } from '../../../db/codexChatSetting/drizzle/drizzle.mapper.codexChatSetting.js'

export class CodexChatSettingDrizzleSqliteRepo
  extends DraBaseSqlite<IbmCodexChatSetting, IdbCodexChatSettingDrizzleSqlite, typeof codexChatSettingTableSqlite>
  implements IRepositoryPortCodexChatSetting
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(codexChatSettingTableSqlite, {
      mapper: mapperCodexChatSettingDrizzle as any,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
