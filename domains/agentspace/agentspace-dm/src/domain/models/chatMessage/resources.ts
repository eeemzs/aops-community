import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmChatMessage } from './IbmChatMessage.js'

export interface IChatMessageMlgTags {
  // add keys here if needed
}

export const chatMessageResources: BmResourceInline<IbmChatMessage, IChatMessageMlgTags> = {
  fields: {},
}

export type IChatMessageTranslationKeys = I18nBmValidKeys<
  IbmChatMessage,
  ValidationResourceType,
  IChatMessageMlgTags
>
export type IChatMessageZodCtx = I18nZodContextWithChain<IbmChatMessage, IChatMessageTranslationKeys>
