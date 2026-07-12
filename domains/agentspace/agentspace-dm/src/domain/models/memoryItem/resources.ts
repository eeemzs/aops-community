import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmMemoryItem } from './IbmMemoryItem.js'

export interface IMemoryItemMlgTags {
  // add keys here if needed
}

export const memoryItemResources: BmResourceInline<IbmMemoryItem, IMemoryItemMlgTags> = {
  fields: {}
}

export type IMemoryItemTranslationKeys = I18nBmValidKeys<IbmMemoryItem, ValidationResourceType, IMemoryItemMlgTags>
export type IMemoryItemZodCtx = I18nZodContextWithChain<IbmMemoryItem, IMemoryItemTranslationKeys>
