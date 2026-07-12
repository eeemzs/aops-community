import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmTaskLabelLink } from './IbmTaskLabelLink.js'
import { ITaskLabelLinkMlgTags, ITaskLabelLinkZodCtx, taskLabelLinkResources } from './resources.js'
import { createTaskLabelLinkZodSchemaWithContext } from './zod.schema.js'
import { bmTaskLabelLinkMlgFields } from './IbmTaskLabelLink.js'

export class BmTaskLabelLink extends BmBase<IbmTaskLabelLink, ITaskLabelLinkMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmTaskLabelLink> = bmTaskLabelLinkMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmTaskLabelLink>) {
    super({ data, locale, fallbackLocale, logger }, taskLabelLinkResources)
  }

  public buildSchemas(zodCtx: ITaskLabelLinkZodCtx) {
    return {
      default: createTaskLabelLinkZodSchemaWithContext(zodCtx),
    }
  }
}
