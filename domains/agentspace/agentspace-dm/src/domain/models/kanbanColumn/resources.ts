import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmKanbanColumn } from './IbmKanbanColumn.js'

export interface IKanbanColumnMlgTags {
  // add keys here if needed
}

export const kanbanColumnResources: BmResourceInline<IbmKanbanColumn, IKanbanColumnMlgTags> = {
  fields: {}
}

export type IKanbanColumnTranslationKeys = I18nBmValidKeys<IbmKanbanColumn, ValidationResourceType, IKanbanColumnMlgTags>
export type IKanbanColumnZodCtx = I18nZodContextWithChain<IbmKanbanColumn, IKanbanColumnTranslationKeys>
