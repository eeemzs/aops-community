import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmChatRoomMember } from './IbmChatRoomMember.js'

export interface IChatRoomMemberMlgTags {
  // add keys here if needed
}

export const chatRoomMemberResources: BmResourceInline<IbmChatRoomMember, IChatRoomMemberMlgTags> = {
  fields: {},
}

export type IChatRoomMemberTranslationKeys = I18nBmValidKeys<
  IbmChatRoomMember,
  ValidationResourceType,
  IChatRoomMemberMlgTags
>
export type IChatRoomMemberZodCtx = I18nZodContextWithChain<
  IbmChatRoomMember,
  IChatRoomMemberTranslationKeys
>
