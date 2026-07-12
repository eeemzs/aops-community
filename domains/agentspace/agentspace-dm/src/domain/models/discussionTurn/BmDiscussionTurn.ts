import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmDiscussionTurn } from './IbmDiscussionTurn.js'
import {
  IDiscussionTurnMlgTags,
  IDiscussionTurnZodCtx,
  discussionTurnResources,
} from './resources.js'
import { createDiscussionTurnZodSchemaWithContext } from './zod.schema.js'
import { bmDiscussionTurnMlgFields } from './IbmDiscussionTurn.js'

export class BmDiscussionTurn extends BmBase<IbmDiscussionTurn, IDiscussionTurnMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmDiscussionTurn> = bmDiscussionTurnMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmDiscussionTurn>) {
    super({ data, locale, fallbackLocale, logger }, discussionTurnResources)
  }

  public buildSchemas(zodCtx: IDiscussionTurnZodCtx) {
    return {
      default: createDiscussionTurnZodSchemaWithContext(zodCtx),
    }
  }
}
