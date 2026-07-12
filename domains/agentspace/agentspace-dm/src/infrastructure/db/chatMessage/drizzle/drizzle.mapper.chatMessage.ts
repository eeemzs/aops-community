import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmChatMessage } from '../../../../domain/models/index.js'
import {
  ChatMessageColumnsDrizzle,
  IdbChatMessageDrizzle,
} from './drizzle.schema.chatMessage.js'

const conversions: FieldConversionLookup<IbmChatMessage, ChatMessageColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
}

export const mapperChatMessageDrizzle = createBmDbMapper<
  IbmChatMessage,
  IdbChatMessageDrizzle,
  ChatMessageColumnsDrizzle
>(conversions)
