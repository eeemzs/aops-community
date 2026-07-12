import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IKanbanColumnZodCtx } from './resources.js'

export const kanbanColumnZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    wipLimit: z.number().int().min(0).optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
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
export const createKanbanColumnZodSchemaWithContext = (_ctx?: IKanbanColumnZodCtx) => {
  return kanbanColumnZodSchema.strict()
}
