import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmTaskLabelLink } from './IbmTaskLabelLink.js'

export interface ITaskLabelLinkMlgTags {
  dummy?: string
}

export const taskLabelLinkResources: BmResourceInline<IbmTaskLabelLink, ITaskLabelLinkMlgTags> = {
  fields: {}
}

export type ITaskLabelLinkTranslationKeys = I18nBmValidKeys<IbmTaskLabelLink, ValidationResourceType, ITaskLabelLinkMlgTags>
export type ITaskLabelLinkZodCtx = I18nZodContextWithChain<IbmTaskLabelLink, ITaskLabelLinkTranslationKeys>
