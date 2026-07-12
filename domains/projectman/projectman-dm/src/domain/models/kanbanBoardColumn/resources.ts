import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmKanbanBoardColumn } from './IbmKanbanBoardColumn.js'

export interface IKanbanBoardColumnMlgTags {
  // add keys here if needed
}

export const kanbanBoardColumnResources: BmResourceInline<IbmKanbanBoardColumn, IKanbanBoardColumnMlgTags> = {
  fields: {}
}

export type IKanbanBoardColumnTranslationKeys = I18nBmValidKeys<IbmKanbanBoardColumn, ValidationResourceType, IKanbanBoardColumnMlgTags>
export type IKanbanBoardColumnZodCtx = I18nZodContextWithChain<IbmKanbanBoardColumn, IKanbanBoardColumnTranslationKeys>
