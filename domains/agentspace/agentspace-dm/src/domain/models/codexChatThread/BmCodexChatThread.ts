import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmCodexChatThread } from './IbmCodexChatThread.js'
import { ICodexChatThreadMlgTags, ICodexChatThreadZodCtx, codexChatThreadResources } from './resources.js'
import { createCodexChatThreadZodSchemaWithContext } from './zod.schema.js'
import { bmCodexChatThreadMlgFields } from './IbmCodexChatThread.js'

export class BmCodexChatThread extends BmBase<IbmCodexChatThread, ICodexChatThreadMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmCodexChatThread> = bmCodexChatThreadMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmCodexChatThread>) {
    super({ data, locale, fallbackLocale, logger }, codexChatThreadResources)
  }

  public buildSchemas(zodCtx: ICodexChatThreadZodCtx) {
    return {
      default: createCodexChatThreadZodSchemaWithContext(zodCtx),
    }
  }
}

