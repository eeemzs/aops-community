import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmTaskLabel } from './IbmTaskLabel.js'

export interface ITaskLabelMlgTags {
  dummy?: string
}

export const taskLabelResources: BmResourceInline<IbmTaskLabel, ITaskLabelMlgTags> = {
  fields: {}
}

export type ITaskLabelTranslationKeys = I18nBmValidKeys<IbmTaskLabel, ValidationResourceType, ITaskLabelMlgTags>
export type ITaskLabelZodCtx = I18nZodContextWithChain<IbmTaskLabel, ITaskLabelTranslationKeys>
