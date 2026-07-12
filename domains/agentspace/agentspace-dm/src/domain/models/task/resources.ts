import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmTask } from './IbmTask.js'

export interface ITaskMlgTags {
  // add keys here if needed
}

export const taskResources: BmResourceInline<IbmTask, ITaskMlgTags> = {
  fields: {}
}

export type ITaskTranslationKeys = I18nBmValidKeys<IbmTask, ValidationResourceType, ITaskMlgTags>
export type ITaskZodCtx = I18nZodContextWithChain<IbmTask, ITaskTranslationKeys>
