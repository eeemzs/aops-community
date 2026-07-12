import { createBmDbMapper, FieldConversionLookup, stringToUuid, uuidToString } from '@aopslab/xf-db'
import { IbmChatRoomMember } from '../../../../domain/models/index.js'
import {
  ChatRoomMemberColumnsDrizzle,
  IdbChatRoomMemberDrizzle,
} from './drizzle.schema.chatRoomMember.js'

const conversions: FieldConversionLookup<IbmChatRoomMember, ChatRoomMemberColumnsDrizzle> = {
  id: { toDomain: uuidToString, toDb: stringToUuid },
  //==> field-conversions
  // customField: { toDomain: (v) => v, toDb: (v) => v },
  //<==//
}

export const mapperChatRoomMemberDrizzle = createBmDbMapper<
  IbmChatRoomMember,
  IdbChatRoomMemberDrizzle,
  ChatRoomMemberColumnsDrizzle
>(conversions)
