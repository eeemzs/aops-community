import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmActivityItem } from './IbmActivityItem.js'

export interface IActivityItemMlgTags {}

export const activityItemResources: BmResourceInline<IbmActivityItem, IActivityItemMlgTags> = {
  fields: {}
}

export type IActivityItemTranslationKeys = I18nBmValidKeys<IbmActivityItem, ValidationResourceType, IActivityItemMlgTags>
export type IActivityItemZodCtx = I18nZodContextWithChain<IbmActivityItem, IActivityItemTranslationKeys>
