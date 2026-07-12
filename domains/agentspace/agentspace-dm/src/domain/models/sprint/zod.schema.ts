import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { scopeableFields, SPRINT_STATUSES } from '../../types.js'
import { ISprintZodCtx } from './resources.js'

export const sprintZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    ...scopeableFields,
    name: z.string(),
    goal: z.string().optional(),
    status: z.enum(SPRINT_STATUSES),
    tags: z.array(z.string()).optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
    startAt: z.date().optional(),
    endAt: z.date().optional(),
  })

/* Insert schema */
export const sprintZodSchemaInsert = sprintZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createSprintZodSchemaWithContext = (ctx?: ISprintZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return sprintZodSchema.strict()
}
