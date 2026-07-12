import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { scopeScopedFields } from '../../types.js'
import { IKanbanBoardZodCtx } from './resources.js'

export const kanbanBoardZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    ...scopeScopedFields,
    name: z.string(),
    slug: z.string().optional(),
    description: z.string().optional(),
    position: z.number().int().min(0),
    archivedAt: z.date().nullable().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const kanbanBoardZodSchemaInsert = kanbanBoardZodSchema.omit({
  id: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createKanbanBoardZodSchemaWithContext = (_ctx?: IKanbanBoardZodCtx) => {
  return kanbanBoardZodSchema.strict()
}
