import { Effect } from 'effect'
import { and, eq, gt } from 'drizzle-orm'
import type { DbQueryOptions, RepositoryConfig, RepositoryError } from '@aopslab/xf-db'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmChatMessage } from '../../../../domain/models/index.js'
import { IRepositoryPortChatMessage } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbChatMessageDrizzle,
  chatMessageTable,
} from '../../../db/chatMessage/drizzle/drizzle.schema.chatMessage.js'
import { mapperChatMessageDrizzle } from '../../../db/chatMessage/drizzle/drizzle.mapper.chatMessage.js'

export class ChatMessageDrizzleRepo
  extends DraBase<IbmChatMessage, IdbChatMessageDrizzle, typeof chatMessageTable>
  implements IRepositoryPortChatMessage
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(chatMessageTable, {
      mapper: mapperChatMessageDrizzle,
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
    } as DbQueryOptions<IdbChatMessageDrizzle>
    return this.find({
      match: and(eq(chatMessageTable.roomId, roomId), gt(chatMessageTable.seq, afterSeq)),
      options: queryOptions,
    }) as Effect.Effect<IbmChatMessage[], RepositoryError>
  }
}
