import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmChatRoom } from '../../../../domain/models/index.js'
import {
  ChatRoomColumnsDrizzle,
  IdbChatRoomDrizzle,
} from './drizzle.schema.chatRoom.js'

const conversions: FieldConversionLookup<IbmChatRoom, ChatRoomColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
}

export const mapperChatRoomDrizzle = createBmDbMapper<
  IbmChatRoom,
  IdbChatRoomDrizzle,
  ChatRoomColumnsDrizzle
>(conversions)
