import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmChatRoomMember } from './IbmChatRoomMember.js'
import {
  IChatRoomMemberMlgTags,
  IChatRoomMemberZodCtx,
  chatRoomMemberResources,
} from './resources.js'
import { createChatRoomMemberZodSchemaWithContext } from './zod.schema.js'
import { bmChatRoomMemberMlgFields } from './IbmChatRoomMember.js'

export class BmChatRoomMember extends BmBase<IbmChatRoomMember, IChatRoomMemberMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmChatRoomMember> = bmChatRoomMemberMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmChatRoomMember>) {
    super({ data, locale, fallbackLocale, logger }, chatRoomMemberResources)
  }

  public buildSchemas(zodCtx: IChatRoomMemberZodCtx) {
    return {
      default: createChatRoomMemberZodSchemaWithContext(zodCtx),
    }
  }
}
