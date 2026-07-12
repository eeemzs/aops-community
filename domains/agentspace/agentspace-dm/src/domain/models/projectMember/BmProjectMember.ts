import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmProjectMember } from './IbmProjectMember.js'
import { IProjectMemberMlgTags, IProjectMemberZodCtx, projectMemberResources } from './resources.js'
import { createProjectMemberZodSchemaWithContext } from './zod.schema.js'
import { bmProjectMemberMlgFields } from './IbmProjectMember.js'

export class BmProjectMember extends BmBase<IbmProjectMember, IProjectMemberMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmProjectMember> = bmProjectMemberMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmProjectMember>) {
    super({ data, locale, fallbackLocale, logger }, projectMemberResources)
  }

  public buildSchemas(zodCtx: IProjectMemberZodCtx) {
    return {
      default: createProjectMemberZodSchemaWithContext(zodCtx),
    }
  }
}

