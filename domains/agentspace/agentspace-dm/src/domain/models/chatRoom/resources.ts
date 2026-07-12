import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmChatRoom } from './IbmChatRoom.js'

export interface IChatRoomMlgTags {
  // add keys here if needed
}

export const chatRoomResources: BmResourceInline<IbmChatRoom, IChatRoomMlgTags> = {
  fields: {},
}

export type IChatRoomTranslationKeys = I18nBmValidKeys<
  IbmChatRoom,
  ValidationResourceType,
  IChatRoomMlgTags
>
export type IChatRoomZodCtx = I18nZodContextWithChain<IbmChatRoom, IChatRoomTranslationKeys>
