import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { SPRINT_ITEM_STATUSES } from '../../types.js'
import { ISprintItemZodCtx } from './resources.js'

export const sprintItemZodSchema = z.object({
  ...IbmZodSchema.shape,
  projectId: z.string(),
  sprintId: z.string(),
  title: z.string(),
  status: z.enum(SPRINT_ITEM_STATUSES),
  position: z.number().int(),
  openedAt: z.date().optional(),
  closedAt: z.date().optional(),
  refType: z.string().optional(),
  refId: z.string().optional(),
  notes: z.string().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
  meta: z.unknown().optional(),
})

/* Insert schema */
export const sprintItemZodSchemaInsert = sprintItemZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createSprintItemZodSchemaWithContext = (_ctx?: ISprintItemZodCtx) => {
  return sprintItemZodSchema.strict()
}
