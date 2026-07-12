import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmDiscussionOutput } from './IbmDiscussionOutput.js'
import {
  IDiscussionOutputMlgTags,
  IDiscussionOutputZodCtx,
  discussionOutputResources,
} from './resources.js'
import { createDiscussionOutputZodSchemaWithContext } from './zod.schema.js'
import { bmDiscussionOutputMlgFields } from './IbmDiscussionOutput.js'

export class BmDiscussionOutput extends BmBase<IbmDiscussionOutput, IDiscussionOutputMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmDiscussionOutput> = bmDiscussionOutputMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmDiscussionOutput>) {
    super({ data, locale, fallbackLocale, logger }, discussionOutputResources)
  }

  public buildSchemas(zodCtx: IDiscussionOutputZodCtx) {
    return {
      default: createDiscussionOutputZodSchemaWithContext(zodCtx),
    }
  }
}
