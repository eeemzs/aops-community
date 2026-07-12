import { Effect } from 'effect'
import type { RepositoryConfig, RepositoryError } from '@aopslab/xf-db'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmChatRoom } from '../../../../domain/models/index.js'
import { IRepositoryPortChatRoom } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbChatRoomDrizzle,
  chatRoomTable,
} from '../../../db/chatRoom/drizzle/drizzle.schema.chatRoom.js'
import { mapperChatRoomDrizzle } from '../../../db/chatRoom/drizzle/drizzle.mapper.chatRoom.js'

export class ChatRoomDrizzleRepo
  extends DraBase<IbmChatRoom, IdbChatRoomDrizzle, typeof chatRoomTable>
  implements IRepositoryPortChatRoom
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(chatRoomTable, {
      mapper: mapperChatRoomDrizzle,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }

  allocateNextSeq(roomId: string, patch: Partial<IbmChatRoom> = {}): Effect.Effect<IbmChatRoom, RepositoryError> {
    return this.findSingle({ matchEq: { id: roomId } as any, forUpdate: true }).pipe(
      Effect.flatMap((room) =>
        this.patchById(roomId, {
          ...patch,
          lastSeq: Number(room.lastSeq ?? 0) + 1,
        })
      )
    ) as Effect.Effect<IbmChatRoom, RepositoryError>
  }
}
