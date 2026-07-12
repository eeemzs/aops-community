import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmTag } from './IbmTag.js'

export interface ITagMlgTags {
  // add keys here if needed
}

export const tagResources: BmResourceInline<IbmTag, ITagMlgTags> = {
  fields: {}
}

export type ITagTranslationKeys = I18nBmValidKeys<IbmTag, ValidationResourceType, ITagMlgTags>
export type ITagZodCtx = I18nZodContextWithChain<IbmTag, ITagTranslationKeys>
