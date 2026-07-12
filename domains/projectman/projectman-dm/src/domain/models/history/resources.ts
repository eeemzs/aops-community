import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmHistory } from './IbmHistory.js'

export interface IHistoryMlgTags {
  // add keys here if needed
}

export const historyResources: BmResourceInline<IbmHistory, IHistoryMlgTags> = {
  fields: {}
}

export type IHistoryTranslationKeys = I18nBmValidKeys<IbmHistory, ValidationResourceType, IHistoryMlgTags>
export type IHistoryZodCtx = I18nZodContextWithChain<IbmHistory, IHistoryTranslationKeys>
