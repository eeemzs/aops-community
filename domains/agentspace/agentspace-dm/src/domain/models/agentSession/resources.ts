import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmAgentSession } from './IbmAgentSession.js'

export interface IAgentSessionMlgTags {
  // add keys here if needed
}

export const agentSessionResources: BmResourceInline<IbmAgentSession, IAgentSessionMlgTags> = {
  fields: {}
}

export type IAgentSessionTranslationKeys = I18nBmValidKeys<IbmAgentSession, ValidationResourceType, IAgentSessionMlgTags>
export type IAgentSessionZodCtx = I18nZodContextWithChain<IbmAgentSession, IAgentSessionTranslationKeys>
