import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { ITaskChecklistItemZodCtx } from './resources.js'

export const taskChecklistItemZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    taskId: z.string(),
    content: z.string(),
    isDone: z.boolean(),
    position: z.number().int().min(0),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

export const taskChecklistItemZodSchemaInsert = taskChecklistItemZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

export const createTaskChecklistItemZodSchemaWithContext = (_ctx?: ITaskChecklistItemZodCtx) => {
  return taskChecklistItemZodSchema.strict()
}
