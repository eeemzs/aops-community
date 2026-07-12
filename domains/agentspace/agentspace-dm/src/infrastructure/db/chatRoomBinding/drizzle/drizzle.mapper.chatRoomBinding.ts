import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmChatRoomBinding } from '../../../../domain/models/index.js'
import {
  ChatRoomBindingColumnsDrizzle,
  IdbChatRoomBindingDrizzle,
} from './drizzle.schema.chatRoomBinding.js'

const conversions: FieldConversionLookup<IbmChatRoomBinding, ChatRoomBindingColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
}

export const mapperChatRoomBindingDrizzle = createBmDbMapper<
  IbmChatRoomBinding,
  IdbChatRoomBindingDrizzle,
  ChatRoomBindingColumnsDrizzle
>(conversions)
