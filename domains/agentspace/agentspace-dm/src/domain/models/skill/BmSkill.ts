import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmSkill } from './IbmSkill.js'
import { ISkillMlgTags, ISkillZodCtx, skillResources } from './resources.js'
import { createSkillZodSchemaWithContext } from './zod.schema.js'
import { bmSkillMlgFields } from './IbmSkill.js'

export class BmSkill extends BmBase<IbmSkill, ISkillMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmSkill> = bmSkillMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmSkill>) {
    super({ data, locale, fallbackLocale, logger }, skillResources)
  }

  public buildSchemas(zodCtx: ISkillZodCtx) {
    return {
      default: createSkillZodSchemaWithContext(zodCtx),
    }
  }
}

