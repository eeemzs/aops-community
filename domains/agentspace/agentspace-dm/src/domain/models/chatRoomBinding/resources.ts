import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmChatRoomBinding } from './IbmChatRoomBinding.js'

export interface IChatRoomBindingMlgTags {
  // add keys here if needed
}

export const chatRoomBindingResources: BmResourceInline<IbmChatRoomBinding, IChatRoomBindingMlgTags> = {
  fields: {},
}

export type IChatRoomBindingTranslationKeys = I18nBmValidKeys<
  IbmChatRoomBinding,
  ValidationResourceType,
  IChatRoomBindingMlgTags
>
export type IChatRoomBindingZodCtx = I18nZodContextWithChain<
  IbmChatRoomBinding,
  IChatRoomBindingTranslationKeys
>
