import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmSprint } from './IbmSprint.js'

export interface ISprintMlgTags {
  // add keys here if needed
}

export const sprintResources: BmResourceInline<IbmSprint, ISprintMlgTags> = {
  fields: {}
}

export type ISprintTranslationKeys = I18nBmValidKeys<IbmSprint, ValidationResourceType, ISprintMlgTags>
export type ISprintZodCtx = I18nZodContextWithChain<IbmSprint, ISprintTranslationKeys>
