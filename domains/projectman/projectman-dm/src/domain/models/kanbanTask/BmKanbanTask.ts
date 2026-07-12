import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmKanbanTask } from './IbmKanbanTask.js'
import type { ZodType } from 'zod'
import { IKanbanTaskMlgTags, IKanbanTaskZodCtx, kanbanTaskResources } from './resources.js'
import { createKanbanTaskZodSchemaWithContext } from './zod.schema.js'
import { bmKanbanTaskMlgFields } from './IbmKanbanTask.js'

export class BmKanbanTask extends BmBase<IbmKanbanTask, IKanbanTaskMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmKanbanTask> = bmKanbanTaskMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmKanbanTask>) {
    super({ data, locale, fallbackLocale, logger }, kanbanTaskResources)
  }

  public buildSchemas(zodCtx: IKanbanTaskZodCtx): Record<string, ZodType> {
    return {
      default: createKanbanTaskZodSchemaWithContext(zodCtx),
    }
  }
}
