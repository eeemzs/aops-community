import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmTaskComment } from './IbmTaskComment.js'

export interface ITaskCommentMlgTags {
  // add keys here if needed
  dummy?: string
}

export const taskCommentResources: BmResourceInline<IbmTaskComment, ITaskCommentMlgTags> = {
  fields: {}
}

export type ITaskCommentTranslationKeys = I18nBmValidKeys<IbmTaskComment, ValidationResourceType, ITaskCommentMlgTags>
export type ITaskCommentZodCtx = I18nZodContextWithChain<IbmTaskComment, ITaskCommentTranslationKeys>

