import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmDiscussionTurn } from './IbmDiscussionTurn.js'

export interface IDiscussionTurnMlgTags {
  // add keys here if needed
}

export const discussionTurnResources: BmResourceInline<IbmDiscussionTurn, IDiscussionTurnMlgTags> = {
  fields: {},
}

export type IDiscussionTurnTranslationKeys = I18nBmValidKeys<
  IbmDiscussionTurn,
  ValidationResourceType,
  IDiscussionTurnMlgTags
>
export type IDiscussionTurnZodCtx = I18nZodContextWithChain<
  IbmDiscussionTurn,
  IDiscussionTurnTranslationKeys
>
