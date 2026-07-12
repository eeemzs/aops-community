import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmResource } from './IbmResource.js'

export interface IResourceMlgTags {
  // add keys here if needed
}

export const resourceResources: BmResourceInline<IbmResource, IResourceMlgTags> = {
  fields: {}
}

export type IResourceTranslationKeys = I18nBmValidKeys<IbmResource, ValidationResourceType, IResourceMlgTags>
export type IResourceZodCtx = I18nZodContextWithChain<IbmResource, IResourceTranslationKeys>
