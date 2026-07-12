import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmProjectPath } from './IbmProjectPath.js'
import { IProjectPathMlgTags, IProjectPathZodCtx, projectPathResources } from './resources.js'
import { createProjectPathZodSchemaWithContext } from './zod.schema.js'
import { bmProjectPathMlgFields } from './IbmProjectPath.js'

export class BmProjectPath extends BmBase<IbmProjectPath, IProjectPathMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmProjectPath> = bmProjectPathMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmProjectPath>) {
    super({ data, locale, fallbackLocale, logger }, projectPathResources)
  }

  public buildSchemas(zodCtx: IProjectPathZodCtx) {
    return {
      default: createProjectPathZodSchemaWithContext(zodCtx),
    }
  }
}

