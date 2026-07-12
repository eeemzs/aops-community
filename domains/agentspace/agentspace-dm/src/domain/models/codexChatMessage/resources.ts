import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmCodexChatMessage } from './IbmCodexChatMessage.js'

export interface ICodexChatMessageMlgTags {
  // add keys here if needed
}

export const codexChatMessageResources: BmResourceInline<IbmCodexChatMessage, ICodexChatMessageMlgTags> = {
  fields: {},
}

export type ICodexChatMessageTranslationKeys = I18nBmValidKeys<
  IbmCodexChatMessage,
  ValidationResourceType,
  ICodexChatMessageMlgTags
>
export type ICodexChatMessageZodCtx = I18nZodContextWithChain<
  IbmCodexChatMessage,
  ICodexChatMessageTranslationKeys
>

