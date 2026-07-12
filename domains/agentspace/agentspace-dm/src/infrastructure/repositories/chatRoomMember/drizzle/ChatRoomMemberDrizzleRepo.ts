import type { RepositoryConfig } from '@aopslab/xf-db'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmChatRoomMember } from '../../../../domain/models/index.js'
import { IRepositoryPortChatRoomMember } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbChatRoomMemberDrizzle,
  chatRoomMemberTable,
} from '../../../db/chatRoomMember/drizzle/drizzle.schema.chatRoomMember.js'
import { mapperChatRoomMemberDrizzle } from '../../../db/chatRoomMember/drizzle/drizzle.mapper.chatRoomMember.js'

export class ChatRoomMemberDrizzleRepo
  extends DraBase<IbmChatRoomMember, IdbChatRoomMemberDrizzle, typeof chatRoomMemberTable>
  implements IRepositoryPortChatRoomMember
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(chatRoomMemberTable, {
      mapper: mapperChatRoomMemberDrizzle,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
