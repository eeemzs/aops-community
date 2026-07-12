import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmScope, bmScopeMlgFields } from './IbmScope.js'
import { IScopeMlgTags, IScopeZodCtx, scopeResources } from './resources.js'
import { createScopeZodSchemaWithContext } from './zod.schema.js'

export class BmScope extends BmBase<IbmScope, IScopeMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmScope> = bmScopeMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmScope>) {
    super({ data, locale, fallbackLocale, logger }, scopeResources)
  }

  public buildSchemas(zodCtx: IScopeZodCtx) {
    return {
      default: createScopeZodSchemaWithContext(zodCtx),
    }
  }
}
