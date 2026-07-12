import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmArtifactLink } from './IbmArtifactLink.js'
import { IArtifactLinkMlgTags, IArtifactLinkZodCtx, artifactLinkResources } from './resources.js'
import { createArtifactLinkZodSchemaWithContext } from './zod.schema.js'
import { bmArtifactLinkMlgFields } from './IbmArtifactLink.js'

export class BmArtifactLink extends BmBase<IbmArtifactLink, IArtifactLinkMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmArtifactLink> = bmArtifactLinkMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmArtifactLink>) {
    super({ data, locale, fallbackLocale, logger }, artifactLinkResources)
  }

  public buildSchemas(zodCtx: IArtifactLinkZodCtx) {
    return {
      default: createArtifactLinkZodSchemaWithContext(zodCtx),
    }
  }
}

