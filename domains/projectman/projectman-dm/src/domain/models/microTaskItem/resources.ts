import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmMicroTaskItem } from './IbmMicroTaskItem.js'

export interface IMicroTaskItemMlgTags {
  // add keys here if needed
}

export const microTaskItemResources: BmResourceInline<IbmMicroTaskItem, IMicroTaskItemMlgTags> = {
  fields: {}
}

export type IMicroTaskItemTranslationKeys = I18nBmValidKeys<IbmMicroTaskItem, ValidationResourceType, IMicroTaskItemMlgTags>
export type IMicroTaskItemZodCtx = I18nZodContextWithChain<IbmMicroTaskItem, IMicroTaskItemTranslationKeys>
