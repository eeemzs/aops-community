import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmMicroTaskItem } from './IbmMicroTaskItem.js'
import type { ZodType } from 'zod'
import { IMicroTaskItemMlgTags, IMicroTaskItemZodCtx, microTaskItemResources } from './resources.js'
import { createMicroTaskItemZodSchemaWithContext } from './zod.schema.js'
import { bmMicroTaskItemMlgFields } from './IbmMicroTaskItem.js'

export class BmMicroTaskItem extends BmBase<IbmMicroTaskItem, IMicroTaskItemMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmMicroTaskItem> = bmMicroTaskItemMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmMicroTaskItem>) {
    super({ data, locale, fallbackLocale, logger }, microTaskItemResources)
  }

  public buildSchemas(zodCtx: IMicroTaskItemZodCtx): Record<string, ZodType> {
    return {
      default: createMicroTaskItemZodSchemaWithContext(zodCtx),
    }
  }
}
