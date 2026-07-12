import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmReviewRequest } from './IbmReviewRequest.js'
import type { ZodType } from 'zod'
import { IReviewRequestMlgTags, IReviewRequestZodCtx, reviewRequestResources } from './resources.js'
import { createReviewRequestZodSchemaWithContext } from './zod.schema.js'
import { bmReviewRequestMlgFields } from './IbmReviewRequest.js'

export class BmReviewRequest extends BmBase<IbmReviewRequest, IReviewRequestMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmReviewRequest> = bmReviewRequestMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmReviewRequest>) {
    super({ data, locale, fallbackLocale, logger }, reviewRequestResources)
  }

  public buildSchemas(zodCtx: IReviewRequestZodCtx): Record<string, ZodType> {
    return {
      default: createReviewRequestZodSchemaWithContext(zodCtx),
    }
  }
}
