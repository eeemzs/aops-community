import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmProjectPath } from './IbmProjectPath.js'

export interface IProjectPathMlgTags {
  // add keys here if needed
}

export const projectPathResources: BmResourceInline<IbmProjectPath, IProjectPathMlgTags> = {
  fields: {}
}

export type IProjectPathTranslationKeys = I18nBmValidKeys<IbmProjectPath, ValidationResourceType, IProjectPathMlgTags>
export type IProjectPathZodCtx = I18nZodContextWithChain<IbmProjectPath, IProjectPathTranslationKeys>
