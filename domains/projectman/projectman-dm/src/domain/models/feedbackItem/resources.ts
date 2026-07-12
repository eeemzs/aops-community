import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmFeedbackItem } from './IbmFeedbackItem.js'

export interface IFeedbackItemMlgTags {
  // add keys here if needed
}

export const feedbackItemResources: BmResourceInline<IbmFeedbackItem, IFeedbackItemMlgTags> = {
  fields: {}
}

export type IFeedbackItemTranslationKeys = I18nBmValidKeys<IbmFeedbackItem, ValidationResourceType, IFeedbackItemMlgTags>
export type IFeedbackItemZodCtx = I18nZodContextWithChain<IbmFeedbackItem, IFeedbackItemTranslationKeys>
