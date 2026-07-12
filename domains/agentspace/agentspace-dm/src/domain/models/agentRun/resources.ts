import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmAgentRun } from './IbmAgentRun.js'

export interface IAgentRunMlgTags {
  // add keys here if needed
}

export const agentRunResources: BmResourceInline<IbmAgentRun, IAgentRunMlgTags> = {
  fields: {}
}

export type IAgentRunTranslationKeys = I18nBmValidKeys<IbmAgentRun, ValidationResourceType, IAgentRunMlgTags>
export type IAgentRunZodCtx = I18nZodContextWithChain<IbmAgentRun, IAgentRunTranslationKeys>
