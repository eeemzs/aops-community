import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { ITaskCommentZodCtx } from './resources.js'

export const taskCommentZodSchema = z.object({
  ...IbmZodSchema.shape,
  projectId: z.string(),
  taskId: z.string(),
  author: z.string(),
  body: z.string(),
  meta: z.unknown().optional(),
})

/* Insert schema */
export const taskCommentZodSchemaInsert = taskCommentZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createTaskCommentZodSchemaWithContext = (_ctx?: ITaskCommentZodCtx) => {
  return taskCommentZodSchema.strict()
}
