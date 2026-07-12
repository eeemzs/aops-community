import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { HISTORY_STATUSES } from '../../types.js'
import { IHistoryZodCtx } from './resources.js'

export const historyZodSchema = z.object({
  ...IbmZodSchema.shape,
  scopeId: z.string(),
  projectId: z.string(),
  boardId: z.string().optional(),
  slug: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(HISTORY_STATUSES),
  tags: z.array(z.string()).optional(),
  meta: z.unknown().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
})

/* Insert schema */
export const historyZodSchemaInsert = historyZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createHistoryZodSchemaWithContext = (_ctx?: IHistoryZodCtx) => {
  return historyZodSchema.strict()
}
