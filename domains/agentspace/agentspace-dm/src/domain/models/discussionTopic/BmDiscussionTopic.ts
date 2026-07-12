import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmDiscussionTopic } from './IbmDiscussionTopic.js'
import {
  IDiscussionTopicMlgTags,
  IDiscussionTopicZodCtx,
  discussionTopicResources,
} from './resources.js'
import { createDiscussionTopicZodSchemaWithContext } from './zod.schema.js'
import { bmDiscussionTopicMlgFields } from './IbmDiscussionTopic.js'

export class BmDiscussionTopic extends BmBase<IbmDiscussionTopic, IDiscussionTopicMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmDiscussionTopic> = bmDiscussionTopicMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmDiscussionTopic>) {
    super({ data, locale, fallbackLocale, logger }, discussionTopicResources)
  }

  public buildSchemas(zodCtx: IDiscussionTopicZodCtx) {
    return {
      default: createDiscussionTopicZodSchemaWithContext(zodCtx),
    }
  }
}
