import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmExperienceItem } from './IbmExperienceItem.js'

export interface IExperienceItemMlgTags {
  // add keys here if needed
}

export const experienceItemResources: BmResourceInline<IbmExperienceItem, IExperienceItemMlgTags> = {
  fields: {},
}

export type IExperienceItemTranslationKeys = I18nBmValidKeys<IbmExperienceItem, ValidationResourceType, IExperienceItemMlgTags>
export type IExperienceItemZodCtx = I18nZodContextWithChain<IbmExperienceItem, IExperienceItemTranslationKeys>
