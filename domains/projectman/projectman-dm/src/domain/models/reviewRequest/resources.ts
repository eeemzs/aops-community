import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmReviewRequest } from './IbmReviewRequest.js'

export interface IReviewRequestMlgTags {
  // add keys here if needed
}

export const reviewRequestResources: BmResourceInline<IbmReviewRequest, IReviewRequestMlgTags> = {
  fields: {}
}

export type IReviewRequestTranslationKeys = I18nBmValidKeys<IbmReviewRequest, ValidationResourceType, IReviewRequestMlgTags>
export type IReviewRequestZodCtx = I18nZodContextWithChain<IbmReviewRequest, IReviewRequestTranslationKeys>
