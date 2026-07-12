import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmSprintItem } from './IbmSprintItem.js'

export interface ISprintItemMlgTags {
  // add keys here if needed
}

export const sprintItemResources: BmResourceInline<IbmSprintItem, ISprintItemMlgTags> = {
  fields: {}
}

export type ISprintItemTranslationKeys = I18nBmValidKeys<IbmSprintItem, ValidationResourceType, ISprintItemMlgTags>
export type ISprintItemZodCtx = I18nZodContextWithChain<IbmSprintItem, ISprintItemTranslationKeys>
