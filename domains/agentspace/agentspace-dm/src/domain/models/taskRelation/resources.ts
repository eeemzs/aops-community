import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmTaskRelation } from './IbmTaskRelation.js'

export interface ITaskRelationMlgTags {
  dummy?: string
}

export const taskRelationResources: BmResourceInline<IbmTaskRelation, ITaskRelationMlgTags> = {
  fields: {}
}

export type ITaskRelationTranslationKeys = I18nBmValidKeys<IbmTaskRelation, ValidationResourceType, ITaskRelationMlgTags>
export type ITaskRelationZodCtx = I18nZodContextWithChain<IbmTaskRelation, ITaskRelationTranslationKeys>
