import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmTaskLabel } from './IbmTaskLabel.js'
import { ITaskLabelMlgTags, ITaskLabelZodCtx, taskLabelResources } from './resources.js'
import { createTaskLabelZodSchemaWithContext } from './zod.schema.js'
import { bmTaskLabelMlgFields } from './IbmTaskLabel.js'

export class BmTaskLabel extends BmBase<IbmTaskLabel, ITaskLabelMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmTaskLabel> = bmTaskLabelMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmTaskLabel>) {
    super({ data, locale, fallbackLocale, logger }, taskLabelResources)
  }

  public buildSchemas(zodCtx: ITaskLabelZodCtx) {
    return {
      default: createTaskLabelZodSchemaWithContext(zodCtx),
    }
  }
}
