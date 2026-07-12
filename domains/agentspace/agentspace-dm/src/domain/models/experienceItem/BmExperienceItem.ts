import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmExperienceItem, bmExperienceItemMlgFields } from './IbmExperienceItem.js'
import { IExperienceItemMlgTags, IExperienceItemZodCtx, experienceItemResources } from './resources.js'
import { createExperienceItemZodSchemaWithContext } from './zod.schema.js'

export class BmExperienceItem extends BmBase<IbmExperienceItem, IExperienceItemMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmExperienceItem> = bmExperienceItemMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmExperienceItem>) {
    super({ data, locale, fallbackLocale, logger }, experienceItemResources)
  }

  public buildSchemas(zodCtx: IExperienceItemZodCtx) {
    return {
      default: createExperienceItemZodSchemaWithContext(zodCtx),
    }
  }
}
