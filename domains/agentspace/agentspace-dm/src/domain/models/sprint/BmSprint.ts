import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmSprint } from './IbmSprint.js'
import { ISprintMlgTags, ISprintZodCtx, sprintResources } from './resources.js'
import { createSprintZodSchemaWithContext } from './zod.schema.js'
import { bmSprintMlgFields } from './IbmSprint.js'

export class BmSprint extends BmBase<IbmSprint, ISprintMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmSprint> = bmSprintMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmSprint>) {
    super({ data, locale, fallbackLocale, logger }, sprintResources)
  }

  public buildSchemas(zodCtx: ISprintZodCtx) {
    return {
      default: createSprintZodSchemaWithContext(zodCtx),
    }
  }
}

