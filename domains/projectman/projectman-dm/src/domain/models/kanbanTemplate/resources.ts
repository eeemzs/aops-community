import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmKanbanTemplate } from './IbmKanbanTemplate.js'

export interface IKanbanTemplateMlgTags {
  // add keys here if needed
}

export const kanbanTemplateResources: BmResourceInline<IbmKanbanTemplate, IKanbanTemplateMlgTags> = {
  fields: {}
}

export type IKanbanTemplateTranslationKeys = I18nBmValidKeys<IbmKanbanTemplate, ValidationResourceType, IKanbanTemplateMlgTags>
export type IKanbanTemplateZodCtx = I18nZodContextWithChain<IbmKanbanTemplate, IKanbanTemplateTranslationKeys>
