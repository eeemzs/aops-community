import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmSprintKanbanTaskLink } from './IbmSprintKanbanTaskLink.js'

export interface ISprintKanbanTaskLinkMlgTags {
  // add keys here if needed
}

export const sprintKanbanTaskLinkResources: BmResourceInline<IbmSprintKanbanTaskLink, ISprintKanbanTaskLinkMlgTags> = {
  fields: {}
}

export type ISprintKanbanTaskLinkTranslationKeys = I18nBmValidKeys<IbmSprintKanbanTaskLink, ValidationResourceType, ISprintKanbanTaskLinkMlgTags>
export type ISprintKanbanTaskLinkZodCtx = I18nZodContextWithChain<IbmSprintKanbanTaskLink, ISprintKanbanTaskLinkTranslationKeys>
