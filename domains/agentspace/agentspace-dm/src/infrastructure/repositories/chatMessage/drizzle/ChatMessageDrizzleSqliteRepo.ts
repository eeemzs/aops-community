import { Effect } from 'effect'
import { and, eq, gt } from 'drizzle-orm'
import type { DbQueryOptions, RepositoryConfig, RepositoryError } from '@aopslab/xf-db'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmChatMessage } from '../../../../domain/models/index.js'
import { IRepositoryPortChatMessage } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbChatMessageDrizzleSqlite,
  chatMessageTableSqlite,
} from '../../../db/chatMessage/drizzle/drizzle.schema.chatMessage.sqlite.js'
import { mapperChatMessageDrizzle } from '../../../db/chatMessage/drizzle/drizzle.mapper.chatMessage.js'

export class ChatMessageDrizzleSqliteRepo
  extends DraBaseSqlite<IbmChatMessage, IdbChatMessageDrizzleSqlite, typeof chatMessageTableSqlite>
  implements IRepositoryPortChatMessage
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(chatMessageTableSqlite, {
      mapper: mapperChatMessageDrizzle as any,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }

  listRoomMessagesAfterSeq(
    roomId: string,
    afterSeq: number,
    options?: DbQueryOptions<IbmChatMessage>
  ): Effect.Effect<IbmChatMessage[], RepositoryError> {
    const queryOptions = {
      ...(options as Record<string, unknown> | undefined),
      sort: (options as any)?.sort ?? ([{ field: 'seq', type: 'asc' }] as any),
    } as DbQueryOptions<IdbChatMessageDrizzleSqlite>
    return this.find({
      match: and(eq(chatMessageTableSqlite.roomId, roomId), gt(chatMessageTableSqlite.seq, afterSeq)),
      options: queryOptions,
    }) as Effect.Effect<IbmChatMessage[], RepositoryError>
  }
}
