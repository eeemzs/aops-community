import { BmBase, BmBaseConstructorParams, MlgFieldsOf } from '@aopslab/xf-bm'
import { IbmKanbanBoard } from './IbmKanbanBoard.js'
import { IKanbanBoardMlgTags, IKanbanBoardZodCtx, kanbanBoardResources } from './resources.js'
import { createKanbanBoardZodSchemaWithContext } from './zod.schema.js'
import { bmKanbanBoardMlgFields } from './IbmKanbanBoard.js'

export class BmKanbanBoard extends BmBase<IbmKanbanBoard, IKanbanBoardMlgTags> {
  public static mlgFields: MlgFieldsOf<IbmKanbanBoard> = bmKanbanBoardMlgFields

  constructor({ data, locale, fallbackLocale, logger }: BmBaseConstructorParams<IbmKanbanBoard>) {
    super({ data, locale, fallbackLocale, logger }, kanbanBoardResources)
  }

  public buildSchemas(zodCtx: IKanbanBoardZodCtx) {
    return {
      default: createKanbanBoardZodSchemaWithContext(zodCtx),
    }
  }
}

