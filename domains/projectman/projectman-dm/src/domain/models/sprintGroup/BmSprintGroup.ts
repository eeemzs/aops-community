import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmSprintGroup } from './IbmSprintGroup.js'
import type { ZodType } from 'zod'
import { ISprintGroupMlgTags, ISprintGroupZodCtx, sprintGroupResources } from './resources.js'
import { createSprintGroupZodSchemaWithContext } from './zod.schema.js'
import { bmSprintGroupMlgFields } from './IbmSprintGroup.js'

export class BmSprintGroup extends BmBase<IbmSprintGroup, ISprintGroupMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmSprintGroup> = bmSprintGroupMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmSprintGroup>) {
    super({ data, locale, fallbackLocale, logger }, sprintGroupResources)
  }

  public buildSchemas(zodCtx: ISprintGroupZodCtx): Record<string, ZodType> {
    return {
      default: createSprintGroupZodSchemaWithContext(zodCtx),
    }
  }
}
