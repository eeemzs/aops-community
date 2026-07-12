import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IKanbanTaskZodCtx } from './resources.js'

export const kanbanTaskZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    boardId: z.string(),
    boardColumnId: z.string(),
    sprintId: z.string().nullable().optional(),
    title: z.string(),
    taskCode: z.string().optional(),
    slug: z.string().optional(),
    description: z.string().optional(),
    progress: z.number().int().min(0).max(100),
    position: z.number().int().min(0),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const kanbanTaskZodSchemaInsert = kanbanTaskZodSchema.omit({
  id: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createKanbanTaskZodSchemaWithContext = (_ctx?: IKanbanTaskZodCtx) => {
  return kanbanTaskZodSchema.strict()
}
