import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IKanbanBoardZodCtx } from './resources.js'

export const kanbanBoardZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    projectId: z.string(),
    name: z.string(),
    description: z.string().optional(),
  })

/* Insert schema */
export const kanbanBoardZodSchemaInsert = kanbanBoardZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createKanbanBoardZodSchemaWithContext = (ctx?: IKanbanBoardZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return kanbanBoardZodSchema.strict()
}
