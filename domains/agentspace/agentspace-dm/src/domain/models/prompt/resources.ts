import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmPrompt } from './IbmPrompt.js'

export interface IPromptMlgTags {
  // add keys here if needed
}

export const promptResources: BmResourceInline<IbmPrompt, IPromptMlgTags> = {
  fields: {}
}

export type IPromptTranslationKeys = I18nBmValidKeys<IbmPrompt, ValidationResourceType, IPromptMlgTags>
export type IPromptZodCtx = I18nZodContextWithChain<IbmPrompt, IPromptTranslationKeys>
