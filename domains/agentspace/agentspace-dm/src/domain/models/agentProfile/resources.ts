import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmAgentProfile } from './IbmAgentProfile.js'

export interface IAgentProfileMlgTags {
  // add keys here if needed
}

export const agentProfileResources: BmResourceInline<IbmAgentProfile, IAgentProfileMlgTags> = {
  fields: {},
}

export type IAgentProfileTranslationKeys = I18nBmValidKeys<IbmAgentProfile, ValidationResourceType, IAgentProfileMlgTags>
export type IAgentProfileZodCtx = I18nZodContextWithChain<IbmAgentProfile, IAgentProfileTranslationKeys>
