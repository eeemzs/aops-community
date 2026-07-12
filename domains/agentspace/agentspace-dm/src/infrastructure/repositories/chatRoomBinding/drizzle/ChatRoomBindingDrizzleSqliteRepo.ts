import type { RepositoryConfig } from '@aopslab/xf-db'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmChatRoomBinding } from '../../../../domain/models/index.js'
import { IRepositoryPortChatRoomBinding } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbChatRoomBindingDrizzleSqlite,
  chatRoomBindingTableSqlite,
} from '../../../db/chatRoomBinding/drizzle/drizzle.schema.chatRoomBinding.sqlite.js'
import { mapperChatRoomBindingDrizzle } from '../../../db/chatRoomBinding/drizzle/drizzle.mapper.chatRoomBinding.js'

export class ChatRoomBindingDrizzleSqliteRepo
  extends DraBaseSqlite<IbmChatRoomBinding, IdbChatRoomBindingDrizzleSqlite, typeof chatRoomBindingTableSqlite>
  implements IRepositoryPortChatRoomBinding
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(chatRoomBindingTableSqlite, {
      mapper: mapperChatRoomBindingDrizzle as any,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
