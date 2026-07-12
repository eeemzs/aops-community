import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmSkillVersion } from './IbmSkillVersion.js'
import { ISkillVersionMlgTags, ISkillVersionZodCtx, skillVersionResources } from './resources.js'
import { createSkillVersionZodSchemaWithContext } from './zod.schema.js'
import { bmSkillVersionMlgFields } from './IbmSkillVersion.js'

export class BmSkillVersion extends BmBase<IbmSkillVersion, ISkillVersionMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmSkillVersion> = bmSkillVersionMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmSkillVersion>) {
    super({ data, locale, fallbackLocale, logger }, skillVersionResources)
  }

  public buildSchemas(zodCtx: ISkillVersionZodCtx) {
    return {
      default: createSkillVersionZodSchemaWithContext(zodCtx),
    }
  }
}

