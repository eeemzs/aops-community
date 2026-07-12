import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmChatRoomBinding } from './IbmChatRoomBinding.js'
import {
  IChatRoomBindingMlgTags,
  IChatRoomBindingZodCtx,
  chatRoomBindingResources,
} from './resources.js'
import { createChatRoomBindingZodSchemaWithContext } from './zod.schema.js'
import { bmChatRoomBindingMlgFields } from './IbmChatRoomBinding.js'

export class BmChatRoomBinding extends BmBase<IbmChatRoomBinding, IChatRoomBindingMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmChatRoomBinding> = bmChatRoomBindingMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmChatRoomBinding>) {
    super({ data, locale, fallbackLocale, logger }, chatRoomBindingResources)
  }

  public buildSchemas(zodCtx: IChatRoomBindingZodCtx) {
    return {
      default: createChatRoomBindingZodSchemaWithContext(zodCtx),
    }
  }
}
