import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmFeedbackItem } from './IbmFeedbackItem.js'
import type { ZodType } from 'zod'
import { IFeedbackItemMlgTags, IFeedbackItemZodCtx, feedbackItemResources } from './resources.js'
import { createFeedbackItemZodSchemaWithContext } from './zod.schema.js'
import { bmFeedbackItemMlgFields } from './IbmFeedbackItem.js'

export class BmFeedbackItem extends BmBase<IbmFeedbackItem, IFeedbackItemMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmFeedbackItem> = bmFeedbackItemMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmFeedbackItem>) {
    super({ data, locale, fallbackLocale, logger }, feedbackItemResources)
  }

  public buildSchemas(zodCtx: IFeedbackItemZodCtx): Record<string, ZodType> {
    return {
      default: createFeedbackItemZodSchemaWithContext(zodCtx),
    }
  }
}
