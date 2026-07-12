import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmProjectmanEvent } from './IbmProjectmanEvent.js'

export interface IProjectmanEventMlgTags {
  // add keys here if needed
}

export const projectmanEventResources: BmResourceInline<IbmProjectmanEvent, IProjectmanEventMlgTags> = {
  fields: {}
}

export type IProjectmanEventTranslationKeys = I18nBmValidKeys<IbmProjectmanEvent, ValidationResourceType, IProjectmanEventMlgTags>
export type IProjectmanEventZodCtx = I18nZodContextWithChain<IbmProjectmanEvent, IProjectmanEventTranslationKeys>
