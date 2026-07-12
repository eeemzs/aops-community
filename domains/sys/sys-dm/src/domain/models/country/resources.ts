import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmCountry } from './IbmCountry.js'

export interface ICountryMlgTags {}

export const countryResources: BmResourceInline<IbmCountry, ICountryMlgTags> = {
  fields: {},
}

export type ICountryTranslationKeys = I18nBmValidKeys<IbmCountry, ValidationResourceType, ICountryMlgTags>
export type ICountryZodCtx = I18nZodContextWithChain<IbmCountry, ICountryTranslationKeys>
