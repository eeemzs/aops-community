import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmPromptVersion } from './IbmPromptVersion.js'

export interface IPromptVersionMlgTags {
  // add keys here if needed
}

export const promptVersionResources: BmResourceInline<IbmPromptVersion, IPromptVersionMlgTags> = {
  fields: {}
}

export type IPromptVersionTranslationKeys = I18nBmValidKeys<IbmPromptVersion, ValidationResourceType, IPromptVersionMlgTags>
export type IPromptVersionZodCtx = I18nZodContextWithChain<IbmPromptVersion, IPromptVersionTranslationKeys>
