import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IKanbanBoardColumnZodCtx } from './resources.js'

export const kanbanBoardColumnZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    boardId: z.string(),
    columnId: z.string(),
    position: z.number().int().min(0),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const kanbanBoardColumnZodSchemaInsert = kanbanBoardColumnZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createKanbanBoardColumnZodSchemaWithContext = (_ctx?: IKanbanBoardColumnZodCtx) => {
  return kanbanBoardColumnZodSchema.strict()
}
