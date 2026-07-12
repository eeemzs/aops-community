import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmProject } from './IbmProject.js'
import { IProjectMlgTags, IProjectZodCtx, projectResources } from './resources.js'
import { createProjectZodSchemaWithContext } from './zod.schema.js'
import { bmProjectMlgFields } from './IbmProject.js'

export class BmProject extends BmBase<IbmProject, IProjectMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmProject> = bmProjectMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmProject>) {
    super({ data, locale, fallbackLocale, logger }, projectResources)
  }

  public buildSchemas(zodCtx: IProjectZodCtx) {
    return {
      default: createProjectZodSchemaWithContext(zodCtx),
    }
  }
}

