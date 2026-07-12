import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmCodexChatSetting } from './IbmCodexChatSetting.js'
import { ICodexChatSettingMlgTags, ICodexChatSettingZodCtx, codexChatSettingResources } from './resources.js'
import { createCodexChatSettingZodSchemaWithContext } from './zod.schema.js'
import { bmCodexChatSettingMlgFields } from './IbmCodexChatSetting.js'

export class BmCodexChatSetting extends BmBase<IbmCodexChatSetting, ICodexChatSettingMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmCodexChatSetting> = bmCodexChatSettingMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmCodexChatSetting>) {
    super({ data, locale, fallbackLocale, logger }, codexChatSettingResources)
  }

  public buildSchemas(zodCtx: ICodexChatSettingZodCtx) {
    return {
      default: createCodexChatSettingZodSchemaWithContext(zodCtx),
    }
  }
}

