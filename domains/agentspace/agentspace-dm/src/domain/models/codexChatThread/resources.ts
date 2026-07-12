import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmCodexChatThread } from './IbmCodexChatThread.js'

export interface ICodexChatThreadMlgTags {
  // add keys here if needed
}

export const codexChatThreadResources: BmResourceInline<IbmCodexChatThread, ICodexChatThreadMlgTags> = {
  fields: {},
}

export type ICodexChatThreadTranslationKeys = I18nBmValidKeys<
  IbmCodexChatThread,
  ValidationResourceType,
  ICodexChatThreadMlgTags
>
export type ICodexChatThreadZodCtx = I18nZodContextWithChain<
  IbmCodexChatThread,
  ICodexChatThreadTranslationKeys
>

