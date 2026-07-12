import type { RepositoryConfig } from '@aopslab/xf-db'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmChatRoomBinding } from '../../../../domain/models/index.js'
import { IRepositoryPortChatRoomBinding } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbChatRoomBindingDrizzle,
  chatRoomBindingTable,
} from '../../../db/chatRoomBinding/drizzle/drizzle.schema.chatRoomBinding.js'
import { mapperChatRoomBindingDrizzle } from '../../../db/chatRoomBinding/drizzle/drizzle.mapper.chatRoomBinding.js'

export class ChatRoomBindingDrizzleRepo
  extends DraBase<IbmChatRoomBinding, IdbChatRoomBindingDrizzle, typeof chatRoomBindingTable>
  implements IRepositoryPortChatRoomBinding
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(chatRoomBindingTable, {
      mapper: mapperChatRoomBindingDrizzle,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
