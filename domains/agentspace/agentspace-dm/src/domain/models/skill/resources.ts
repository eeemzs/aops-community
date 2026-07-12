import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmSkill } from './IbmSkill.js'

export interface ISkillMlgTags {
  // add keys here if needed
}

export const skillResources: BmResourceInline<IbmSkill, ISkillMlgTags> = {
  fields: {}
}

export type ISkillTranslationKeys = I18nBmValidKeys<IbmSkill, ValidationResourceType, ISkillMlgTags>
export type ISkillZodCtx = I18nZodContextWithChain<IbmSkill, ISkillTranslationKeys>
