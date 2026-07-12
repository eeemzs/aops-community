import { Effect } from 'effect'
import type { RepositoryConfig, RepositoryError } from '@aopslab/xf-db'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmChatRoom } from '../../../../domain/models/index.js'
import { IRepositoryPortChatRoom } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbChatRoomDrizzleSqlite,
  chatRoomTableSqlite,
} from '../../../db/chatRoom/drizzle/drizzle.schema.chatRoom.sqlite.js'
import { mapperChatRoomDrizzle } from '../../../db/chatRoom/drizzle/drizzle.mapper.chatRoom.js'

export class ChatRoomDrizzleSqliteRepo
  extends DraBaseSqlite<IbmChatRoom, IdbChatRoomDrizzleSqlite, typeof chatRoomTableSqlite>
  implements IRepositoryPortChatRoom
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(chatRoomTableSqlite, {
      mapper: mapperChatRoomDrizzle as any,
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
