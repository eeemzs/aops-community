import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmChatRoom } from './IbmChatRoom.js'
import { IChatRoomMlgTags, IChatRoomZodCtx, chatRoomResources } from './resources.js'
import { createChatRoomZodSchemaWithContext } from './zod.schema.js'
import { bmChatRoomMlgFields } from './IbmChatRoom.js'

export class BmChatRoom extends BmBase<IbmChatRoom, IChatRoomMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmChatRoom> = bmChatRoomMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmChatRoom>) {
    super({ data, locale, fallbackLocale, logger }, chatRoomResources)
  }

  public buildSchemas(zodCtx: IChatRoomZodCtx) {
    return {
      default: createChatRoomZodSchemaWithContext(zodCtx),
    }
  }
}
