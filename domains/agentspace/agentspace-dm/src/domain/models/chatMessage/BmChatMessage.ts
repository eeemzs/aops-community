import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmChatMessage } from './IbmChatMessage.js'
import { IChatMessageMlgTags, IChatMessageZodCtx, chatMessageResources } from './resources.js'
import { createChatMessageZodSchemaWithContext } from './zod.schema.js'
import { bmChatMessageMlgFields } from './IbmChatMessage.js'

export class BmChatMessage extends BmBase<IbmChatMessage, IChatMessageMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmChatMessage> = bmChatMessageMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmChatMessage>) {
    super({ data, locale, fallbackLocale, logger }, chatMessageResources)
  }

  public buildSchemas(zodCtx: IChatMessageZodCtx) {
    return {
      default: createChatMessageZodSchemaWithContext(zodCtx),
    }
  }
}
