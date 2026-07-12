import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { MICROTASK_STATUSES } from '../../types.js'
import { IMicroTaskItemZodCtx } from './resources.js'

export const microTaskItemZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    phaseId: z.string(),
    title: z.string(),
    status: z.enum(MICROTASK_STATUSES),
    position: z.number().int().min(0),
    notes: z.string().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const microTaskItemZodSchemaInsert = microTaskItemZodSchema.omit({
  id: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createMicroTaskItemZodSchemaWithContext = (_ctx?: IMicroTaskItemZodCtx) => {
  return microTaskItemZodSchema.strict()
}
