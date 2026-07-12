import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmArtifact } from './IbmArtifact.js'
import { IArtifactMlgTags, IArtifactZodCtx, artifactResources } from './resources.js'
import { createArtifactZodSchemaWithContext } from './zod.schema.js'
import { bmArtifactMlgFields } from './IbmArtifact.js'

export class BmArtifact extends BmBase<IbmArtifact, IArtifactMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmArtifact> = bmArtifactMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmArtifact>) {
    super({ data, locale, fallbackLocale, logger }, artifactResources)
  }

  public buildSchemas(zodCtx: IArtifactZodCtx) {
    return {
      default: createArtifactZodSchemaWithContext(zodCtx),
    }
  }
}

