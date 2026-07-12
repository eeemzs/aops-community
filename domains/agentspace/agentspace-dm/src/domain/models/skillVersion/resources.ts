import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmSkillVersion } from './IbmSkillVersion.js'

export interface ISkillVersionMlgTags {
  // add keys here if needed
}

export const skillVersionResources: BmResourceInline<IbmSkillVersion, ISkillVersionMlgTags> = {
  fields: {}
}

export type ISkillVersionTranslationKeys = I18nBmValidKeys<IbmSkillVersion, ValidationResourceType, ISkillVersionMlgTags>
export type ISkillVersionZodCtx = I18nZodContextWithChain<IbmSkillVersion, ISkillVersionTranslationKeys>
