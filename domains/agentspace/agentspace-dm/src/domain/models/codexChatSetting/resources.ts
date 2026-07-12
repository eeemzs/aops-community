import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmCodexChatSetting } from './IbmCodexChatSetting.js'

export interface ICodexChatSettingMlgTags {
  // add keys here if needed
}

export const codexChatSettingResources: BmResourceInline<IbmCodexChatSetting, ICodexChatSettingMlgTags> = {
  fields: {},
}

export type ICodexChatSettingTranslationKeys = I18nBmValidKeys<
  IbmCodexChatSetting,
  ValidationResourceType,
  ICodexChatSettingMlgTags
>
export type ICodexChatSettingZodCtx = I18nZodContextWithChain<
  IbmCodexChatSetting,
  ICodexChatSettingTranslationKeys
>

