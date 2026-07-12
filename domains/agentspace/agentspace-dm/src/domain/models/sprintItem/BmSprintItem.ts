import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmSprintItem } from './IbmSprintItem.js'
import { ISprintItemMlgTags, ISprintItemZodCtx, sprintItemResources } from './resources.js'
import { createSprintItemZodSchemaWithContext } from './zod.schema.js'
import { bmSprintItemMlgFields } from './IbmSprintItem.js'

export class BmSprintItem extends BmBase<IbmSprintItem, ISprintItemMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmSprintItem> = bmSprintItemMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmSprintItem>) {
    super({ data, locale, fallbackLocale, logger }, sprintItemResources)
  }

  public buildSchemas(zodCtx: ISprintItemZodCtx) {
    return {
      default: createSprintItemZodSchemaWithContext(zodCtx),
    }
  }
}

