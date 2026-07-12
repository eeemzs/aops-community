import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmTaskComment } from './IbmTaskComment.js'
import { ITaskCommentMlgTags, ITaskCommentZodCtx, taskCommentResources } from './resources.js'
import { createTaskCommentZodSchemaWithContext } from './zod.schema.js'
import { bmTaskCommentMlgFields } from './IbmTaskComment.js'

export class BmTaskComment extends BmBase<IbmTaskComment, ITaskCommentMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmTaskComment> = bmTaskCommentMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmTaskComment>) {
    super({ data, locale, fallbackLocale, logger }, taskCommentResources)
  }

  public buildSchemas(zodCtx: ITaskCommentZodCtx) {
    return {
      default: createTaskCommentZodSchemaWithContext(zodCtx),
    }
  }
}

