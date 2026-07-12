import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmProject } from './IbmProject.js'

export interface IProjectMlgTags {
  // add keys here if needed
}

export const projectResources: BmResourceInline<IbmProject, IProjectMlgTags> = {
  fields: {}
}

export type IProjectTranslationKeys = I18nBmValidKeys<IbmProject, ValidationResourceType, IProjectMlgTags>
export type IProjectZodCtx = I18nZodContextWithChain<IbmProject, IProjectTranslationKeys>
