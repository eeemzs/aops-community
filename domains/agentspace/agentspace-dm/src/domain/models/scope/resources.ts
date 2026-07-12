import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmScope } from './IbmScope.js'

export interface IScopeMlgTags {}

export const scopeResources: BmResourceInline<IbmScope, IScopeMlgTags> = {
  fields: {},
}

export type IScopeTranslationKeys = I18nBmValidKeys<IbmScope, ValidationResourceType, IScopeMlgTags>
export type IScopeZodCtx = I18nZodContextWithChain<IbmScope, IScopeTranslationKeys>
