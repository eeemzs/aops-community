import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { ITaskLabelLinkZodCtx } from './resources.js'

export const taskLabelLinkZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    taskId: z.string(),
    labelId: z.string(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

export const taskLabelLinkZodSchemaInsert = taskLabelLinkZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

export const createTaskLabelLinkZodSchemaWithContext = (_ctx?: ITaskLabelLinkZodCtx) => {
  return taskLabelLinkZodSchema.strict()
}
