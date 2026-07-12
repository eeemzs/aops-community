import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmAgentRunEvent } from './IbmAgentRunEvent.js'

export interface IAgentRunEventMlgTags {
  // add keys here if needed
}

export const agentRunEventResources: BmResourceInline<IbmAgentRunEvent, IAgentRunEventMlgTags> = {
  fields: {}
}

export type IAgentRunEventTranslationKeys = I18nBmValidKeys<IbmAgentRunEvent, ValidationResourceType, IAgentRunEventMlgTags>
export type IAgentRunEventZodCtx = I18nZodContextWithChain<IbmAgentRunEvent, IAgentRunEventTranslationKeys>
