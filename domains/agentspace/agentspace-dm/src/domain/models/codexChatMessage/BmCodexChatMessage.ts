import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmCodexChatMessage } from './IbmCodexChatMessage.js'
import { ICodexChatMessageMlgTags, ICodexChatMessageZodCtx, codexChatMessageResources } from './resources.js'
import { createCodexChatMessageZodSchemaWithContext } from './zod.schema.js'
import { bmCodexChatMessageMlgFields } from './IbmCodexChatMessage.js'

export class BmCodexChatMessage extends BmBase<IbmCodexChatMessage, ICodexChatMessageMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmCodexChatMessage> = bmCodexChatMessageMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmCodexChatMessage>) {
    super({ data, locale, fallbackLocale, logger }, codexChatMessageResources)
  }

  public buildSchemas(zodCtx: ICodexChatMessageZodCtx) {
    return {
      default: createCodexChatMessageZodSchemaWithContext(zodCtx),
    }
  }
}

