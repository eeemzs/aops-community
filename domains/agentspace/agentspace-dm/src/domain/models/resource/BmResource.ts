import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmResource } from './IbmResource.js'
import { IResourceMlgTags, IResourceZodCtx, resourceResources } from './resources.js'
import { createResourceZodSchemaWithContext } from './zod.schema.js'
import { bmResourceMlgFields } from './IbmResource.js'

export class BmResource extends BmBase<IbmResource, IResourceMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmResource> = bmResourceMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmResource>) {
    super({ data, locale, fallbackLocale, logger }, resourceResources)
  }

  public buildSchemas(zodCtx: IResourceZodCtx) {
    return {
      default: createResourceZodSchemaWithContext(zodCtx),
    }
  }
}
