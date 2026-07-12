import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmTask } from './IbmTask.js'
import { ITaskMlgTags, ITaskZodCtx, taskResources } from './resources.js'
import { createTaskZodSchemaWithContext } from './zod.schema.js'
import { bmTaskMlgFields } from './IbmTask.js'

export class BmTask extends BmBase<IbmTask, ITaskMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmTask> = bmTaskMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmTask>) {
    super({ data, locale, fallbackLocale, logger }, taskResources)
  }

  public buildSchemas(zodCtx: ITaskZodCtx) {
    return {
      default: createTaskZodSchemaWithContext(zodCtx),
    }
  }
}

