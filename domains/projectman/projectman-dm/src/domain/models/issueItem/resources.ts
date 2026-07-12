import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmIssueItem } from './IbmIssueItem.js'

export interface IIssueItemMlgTags {
  // add keys here if needed
}

export const issueItemResources: BmResourceInline<IbmIssueItem, IIssueItemMlgTags> = {
  fields: {}
}

export type IIssueItemTranslationKeys = I18nBmValidKeys<IbmIssueItem, ValidationResourceType, IIssueItemMlgTags>
export type IIssueItemZodCtx = I18nZodContextWithChain<IbmIssueItem, IIssueItemTranslationKeys>
