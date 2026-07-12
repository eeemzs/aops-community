import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmKanbanBoardColumn } from './IbmKanbanBoardColumn.js'
import type { ZodType } from 'zod'
import { IKanbanBoardColumnMlgTags, IKanbanBoardColumnZodCtx, kanbanBoardColumnResources } from './resources.js'
import { createKanbanBoardColumnZodSchemaWithContext } from './zod.schema.js'
import { bmKanbanBoardColumnMlgFields } from './IbmKanbanBoardColumn.js'

export class BmKanbanBoardColumn extends BmBase<IbmKanbanBoardColumn, IKanbanBoardColumnMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmKanbanBoardColumn> = bmKanbanBoardColumnMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmKanbanBoardColumn>) {
    super({ data, locale, fallbackLocale, logger }, kanbanBoardColumnResources)
  }

  public buildSchemas(zodCtx: IKanbanBoardColumnZodCtx): Record<string, ZodType> {
    return {
      default: createKanbanBoardColumnZodSchemaWithContext(zodCtx),
    }
  }
}
