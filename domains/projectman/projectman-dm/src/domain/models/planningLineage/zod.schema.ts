import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IPlanningLineageZodCtx } from './resources.js'

export const planningLineageZodSchema = z.object({
  ...IbmZodSchema.shape,
  scopeId: z.string(),
  projectId: z.string(),
  operation: z.enum(['copy', 'move']),
  sourceType: z.string(),
  sourceId: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  copyDepth: z.enum(['shallow', 'deep']).optional(),
  sourceProjectId: z.string().optional(),
  targetProjectId: z.string().optional(),
  details: z.unknown().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
})

export const planningLineageZodSchemaInsert = planningLineageZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

export const createPlanningLineageZodSchemaWithContext = (_ctx?: IPlanningLineageZodCtx) => {
  return planningLineageZodSchema.strict()
}
