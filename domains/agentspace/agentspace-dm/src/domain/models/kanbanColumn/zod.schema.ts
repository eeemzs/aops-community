import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { KANBAN_STATUS_KEYS } from '../../types.js'
import { IKanbanColumnZodCtx } from './resources.js'

export const kanbanColumnZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    projectId: z.string(),
    boardId: z.string(),
    name: z.string(),
    statusKey: z.enum(KANBAN_STATUS_KEYS),
    position: z.number().int().min(0),
    wipLimit: z.number().int().min(0).optional(),
  })

/* Insert schema */
export const kanbanColumnZodSchemaInsert = kanbanColumnZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createKanbanColumnZodSchemaWithContext = (ctx?: IKanbanColumnZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return kanbanColumnZodSchema.strict()
}
