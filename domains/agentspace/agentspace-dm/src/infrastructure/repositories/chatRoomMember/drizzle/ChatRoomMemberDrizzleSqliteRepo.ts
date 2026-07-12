import type { RepositoryConfig } from '@aopslab/xf-db'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmChatRoomMember } from '../../../../domain/models/index.js'
import { IRepositoryPortChatRoomMember } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbChatRoomMemberDrizzleSqlite,
  chatRoomMemberTableSqlite,
} from '../../../db/chatRoomMember/drizzle/drizzle.schema.chatRoomMember.sqlite.js'
import { mapperChatRoomMemberDrizzle } from '../../../db/chatRoomMember/drizzle/drizzle.mapper.chatRoomMember.js'

export class ChatRoomMemberDrizzleSqliteRepo
  extends DraBaseSqlite<IbmChatRoomMember, IdbChatRoomMemberDrizzleSqlite, typeof chatRoomMemberTableSqlite>
  implements IRepositoryPortChatRoomMember
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(chatRoomMemberTableSqlite, {
      mapper: mapperChatRoomMemberDrizzle as any,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
