import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmTaskChecklistItem } from './IbmTaskChecklistItem.js'
import { ITaskChecklistItemMlgTags, ITaskChecklistItemZodCtx, taskChecklistItemResources } from './resources.js'
import { createTaskChecklistItemZodSchemaWithContext } from './zod.schema.js'
import { bmTaskChecklistItemMlgFields } from './IbmTaskChecklistItem.js'

export class BmTaskChecklistItem extends BmBase<IbmTaskChecklistItem, ITaskChecklistItemMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmTaskChecklistItem> = bmTaskChecklistItemMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmTaskChecklistItem>) {
    super({ data, locale, fallbackLocale, logger }, taskChecklistItemResources)
  }

  public buildSchemas(zodCtx: ITaskChecklistItemZodCtx) {
    return {
      default: createTaskChecklistItemZodSchemaWithContext(zodCtx),
    }
  }
}
