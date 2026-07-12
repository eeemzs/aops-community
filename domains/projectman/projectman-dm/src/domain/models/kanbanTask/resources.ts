import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmKanbanTask } from './IbmKanbanTask.js'

export interface IKanbanTaskMlgTags {
  // add keys here if needed
}

export const kanbanTaskResources: BmResourceInline<IbmKanbanTask, IKanbanTaskMlgTags> = {
  fields: {}
}

export type IKanbanTaskTranslationKeys = I18nBmValidKeys<IbmKanbanTask, ValidationResourceType, IKanbanTaskMlgTags>
export type IKanbanTaskZodCtx = I18nZodContextWithChain<IbmKanbanTask, IKanbanTaskTranslationKeys>
