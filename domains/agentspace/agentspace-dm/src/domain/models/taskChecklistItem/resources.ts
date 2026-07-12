import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmTaskChecklistItem } from './IbmTaskChecklistItem.js'

export interface ITaskChecklistItemMlgTags {
  dummy?: string
}

export const taskChecklistItemResources: BmResourceInline<IbmTaskChecklistItem, ITaskChecklistItemMlgTags> = {
  fields: {}
}

export type ITaskChecklistItemTranslationKeys = I18nBmValidKeys<IbmTaskChecklistItem, ValidationResourceType, ITaskChecklistItemMlgTags>
export type ITaskChecklistItemZodCtx = I18nZodContextWithChain<IbmTaskChecklistItem, ITaskChecklistItemTranslationKeys>
