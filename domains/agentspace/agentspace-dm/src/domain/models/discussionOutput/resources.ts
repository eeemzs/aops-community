import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmDiscussionOutput } from './IbmDiscussionOutput.js'

export interface IDiscussionOutputMlgTags {
  // add keys here if needed
}

export const discussionOutputResources: BmResourceInline<IbmDiscussionOutput, IDiscussionOutputMlgTags> = {
  fields: {},
}

export type IDiscussionOutputTranslationKeys = I18nBmValidKeys<
  IbmDiscussionOutput,
  ValidationResourceType,
  IDiscussionOutputMlgTags
>
export type IDiscussionOutputZodCtx = I18nZodContextWithChain<
  IbmDiscussionOutput,
  IDiscussionOutputTranslationKeys
>
