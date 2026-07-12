import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmTaskRelation } from './IbmTaskRelation.js'
import { ITaskRelationMlgTags, ITaskRelationZodCtx, taskRelationResources } from './resources.js'
import { createTaskRelationZodSchemaWithContext } from './zod.schema.js'
import { bmTaskRelationMlgFields } from './IbmTaskRelation.js'

export class BmTaskRelation extends BmBase<IbmTaskRelation, ITaskRelationMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmTaskRelation> = bmTaskRelationMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmTaskRelation>) {
    super({ data, locale, fallbackLocale, logger }, taskRelationResources)
  }

  public buildSchemas(zodCtx: ITaskRelationZodCtx) {
    return {
      default: createTaskRelationZodSchemaWithContext(zodCtx),
    }
  }
}
