import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { TASK_LABEL_COLORS } from '../../types.js'
import { ITaskLabelZodCtx } from './resources.js'

export const taskLabelZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    name: z.string(),
    color: z.enum(TASK_LABEL_COLORS),
    position: z.number().int().min(0),
    meta: z.unknown().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

export const taskLabelZodSchemaInsert = taskLabelZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

export const createTaskLabelZodSchemaWithContext = (_ctx?: ITaskLabelZodCtx) => {
  return taskLabelZodSchema.strict()
}
