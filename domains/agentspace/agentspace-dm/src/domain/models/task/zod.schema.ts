import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { TASK_TYPES } from '../../types.js'
import { ITaskZodCtx } from './resources.js'

export const taskZodSchema = z
  .object({
    ...IbmZodSchema.shape,
    scopeId: z.string(),
    columnId: z.string(),
    sprintId: z.string().optional(),
    promptVersionId: z.string().optional(),
    parentTaskId: z.string().optional(),
    type: z.enum(TASK_TYPES),
    title: z.string(),
    description: z.string().optional(),
    input: z.unknown().optional(),
    meta: z.unknown().optional(),
    assignee: z.string().optional(),
    position: z.number().int().min(0),
    priority: z.number().int().min(0).optional(),
    dueAt: z.date().optional(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })

/* Insert schema */
export const taskZodSchemaInsert = taskZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createTaskZodSchemaWithContext = (ctx?: ITaskZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return taskZodSchema.strict()
}
