import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { TASK_RELATION_KINDS } from '../../types.js'
import { ITaskRelationZodCtx } from './resources.js'

export const taskRelationZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    fromTaskId: z.string(),
    toTaskId: z.string(),
    kind: z.enum(TASK_RELATION_KINDS),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

export const taskRelationZodSchemaInsert = taskRelationZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

export const createTaskRelationZodSchemaWithContext = (_ctx?: ITaskRelationZodCtx) => {
  return taskRelationZodSchema.strict()
}
