import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmTag } from './IbmTag.js'
import { ITagMlgTags, ITagZodCtx, tagResources } from './resources.js'
import { createTagZodSchemaWithContext } from './zod.schema.js'
import { bmTagMlgFields } from './IbmTag.js'

export class BmTag extends BmBase<IbmTag, ITagMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmTag> = bmTagMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmTag>) {
    super({ data, locale, fallbackLocale, logger }, tagResources)
  }

  public buildSchemas(zodCtx: ITagZodCtx) {
    return {
      default: createTagZodSchemaWithContext(zodCtx),
    }
  }
}

