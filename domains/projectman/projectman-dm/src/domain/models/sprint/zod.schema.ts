import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { ISprintZodCtx } from './resources.js'

export const sprintZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    kanbanTaskId: z.string(),
    name: z.string(),
    goal: z.string(),
    references: z.array(z.string()).default([]),
    scope: z.array(z.string()).default([]),
    validationPlan: z.array(z.string()).default([]),
    notes: z.string().optional(),
    archivedAt: z.date().nullable().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const sprintZodSchemaInsert = sprintZodSchema.omit({
  id: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createSprintZodSchemaWithContext = (_ctx?: ISprintZodCtx) => {
  return sprintZodSchema.strict()
}
