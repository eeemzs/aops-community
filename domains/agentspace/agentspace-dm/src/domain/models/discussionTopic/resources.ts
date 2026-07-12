import { BmResourceInline, I18nBmValidKeys } from '@aopslab/xf-i18n/bm'
import { I18nZodContextWithChain, ValidationResourceType } from '@aopslab/xf-validation'
import { IbmDiscussionTopic } from './IbmDiscussionTopic.js'

export interface IDiscussionTopicMlgTags {
  // add keys here if needed
}

export const discussionTopicResources: BmResourceInline<IbmDiscussionTopic, IDiscussionTopicMlgTags> = {
  fields: {},
}

export type IDiscussionTopicTranslationKeys = I18nBmValidKeys<
  IbmDiscussionTopic,
  ValidationResourceType,
  IDiscussionTopicMlgTags
>
export type IDiscussionTopicZodCtx = I18nZodContextWithChain<
  IbmDiscussionTopic,
  IDiscussionTopicTranslationKeys
>
