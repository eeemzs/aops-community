import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmPrompt } from './IbmPrompt.js'
import { IPromptMlgTags, IPromptZodCtx, promptResources } from './resources.js'
import { createPromptZodSchemaWithContext } from './zod.schema.js'
import { bmPromptMlgFields } from './IbmPrompt.js'

export class BmPrompt extends BmBase<IbmPrompt, IPromptMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmPrompt> = bmPromptMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmPrompt>) {
    super({ data, locale, fallbackLocale, logger }, promptResources)
  }

  public buildSchemas(zodCtx: IPromptZodCtx) {
    return {
      default: createPromptZodSchemaWithContext(zodCtx),
    }
  }
}

