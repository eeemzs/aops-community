import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmActivityItem, bmActivityItemMlgFields } from './IbmActivityItem.js'
import { IActivityItemMlgTags, IActivityItemZodCtx, activityItemResources } from './resources.js'
import { createActivityItemZodSchemaWithContext } from './zod.schema.js'

export class BmActivityItem extends BmBase<IbmActivityItem, IActivityItemMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmActivityItem> = bmActivityItemMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmActivityItem>) {
    super({ data, locale, fallbackLocale, logger }, activityItemResources)
  }

  public buildSchemas(zodCtx: IActivityItemZodCtx) {
    return {
      default: createActivityItemZodSchemaWithContext(zodCtx),
    }
  }
}
