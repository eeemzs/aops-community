import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmKanbanColumn } from './IbmKanbanColumn.js'
import { IKanbanColumnMlgTags, IKanbanColumnZodCtx, kanbanColumnResources } from './resources.js'
import { createKanbanColumnZodSchemaWithContext } from './zod.schema.js'
import { bmKanbanColumnMlgFields } from './IbmKanbanColumn.js'

export class BmKanbanColumn extends BmBase<IbmKanbanColumn, IKanbanColumnMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmKanbanColumn> = bmKanbanColumnMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmKanbanColumn>) {
    super({ data, locale, fallbackLocale, logger }, kanbanColumnResources)
  }

  public buildSchemas(zodCtx: IKanbanColumnZodCtx) {
    return {
      default: createKanbanColumnZodSchemaWithContext(zodCtx),
    }
  }
}

