import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IActivityItemZodCtx } from './resources.js'

const activityItemRefSchema = z.object({
  type: z.string(),
  id: z.string(),
  label: z.string().optional(),
}).strict()

export const activityItemZodSchema = z.object({
  ...IbmZodSchema.shape,
  scopeId: z.string(),
  projectId: z.string().optional(),
  sourceKind: z.enum(['aops-cli', 'desktop', 'runner', 'system']),
  sourceId: z.string(),
  action: z.string(),
  status: z.enum(['success', 'error']),
  summary: z.string(),
  refs: z.array(activityItemRefSchema).default([]),
  payload: z.unknown().optional(),
  meta: z.unknown().optional(),
})

export const activityItemZodSchemaInsert = activityItemZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

export const createActivityItemZodSchemaWithContext = (_ctx?: IActivityItemZodCtx) => {
  return activityItemZodSchema.strict()
}
