import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmKanbanBoard } from './IbmKanbanBoard.js'

export interface IKanbanBoardMlgTags {
  // add keys here if needed
}

export const kanbanBoardResources: BmResourceInline<IbmKanbanBoard, IKanbanBoardMlgTags> = {
  fields: {}
}

export type IKanbanBoardTranslationKeys = I18nBmValidKeys<IbmKanbanBoard, ValidationResourceType, IKanbanBoardMlgTags>
export type IKanbanBoardZodCtx = I18nZodContextWithChain<IbmKanbanBoard, IKanbanBoardTranslationKeys>
