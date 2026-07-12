import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmSprintGroup } from './IbmSprintGroup.js'

export interface ISprintGroupMlgTags {
  // add keys here if needed
}

export const sprintGroupResources: BmResourceInline<IbmSprintGroup, ISprintGroupMlgTags> = {
  fields: {}
}

export type ISprintGroupTranslationKeys = I18nBmValidKeys<IbmSprintGroup, ValidationResourceType, ISprintGroupMlgTags>
export type ISprintGroupZodCtx = I18nZodContextWithChain<IbmSprintGroup, ISprintGroupTranslationKeys>
