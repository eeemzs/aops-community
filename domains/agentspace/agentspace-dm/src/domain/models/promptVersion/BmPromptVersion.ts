import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmPromptVersion } from './IbmPromptVersion.js'
import { IPromptVersionMlgTags, IPromptVersionZodCtx, promptVersionResources } from './resources.js'
import { createPromptVersionZodSchemaWithContext } from './zod.schema.js'
import { bmPromptVersionMlgFields } from './IbmPromptVersion.js'

export class BmPromptVersion extends BmBase<IbmPromptVersion, IPromptVersionMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmPromptVersion> = bmPromptVersionMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmPromptVersion>) {
    super({ data, locale, fallbackLocale, logger }, promptVersionResources)
  }

  public buildSchemas(zodCtx: IPromptVersionZodCtx) {
    return {
      default: createPromptVersionZodSchemaWithContext(zodCtx),
    }
  }
}

