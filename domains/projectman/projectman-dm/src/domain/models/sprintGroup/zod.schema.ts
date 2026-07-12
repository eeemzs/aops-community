import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { ISprintGroupZodCtx } from './resources.js'

export const sprintGroupZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    sprintId: z.string(),
    name: z.string(),
    description: z.string().optional(),
    position: z.number().int().min(0),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const sprintGroupZodSchemaInsert = sprintGroupZodSchema.omit({
  id: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createSprintGroupZodSchemaWithContext = (_ctx?: ISprintGroupZodCtx) => {
  return sprintGroupZodSchema.strict()
}
