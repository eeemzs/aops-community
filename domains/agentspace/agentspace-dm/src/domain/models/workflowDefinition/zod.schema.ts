import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IWorkflowDefinitionZodCtx } from './resources.js'

export const workflowDefinitionZodSchema = z.object({
  ...IbmZodSchema.shape,
    scopeId: z.string(),
  definitionId: z.string(),
  name: z.string(),
  mode: z.string(),
  subjectType: z.string().nullable().optional(),
  runtimeProfile: z.string().nullable().optional(),
  steps: z.array(z.record(z.string(), z.unknown())),
  policies: z.unknown().nullable().optional(),
  meta: z.unknown().nullable().optional(),
})

export const workflowDefinitionZodSchemaInsert = workflowDefinitionZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

export const createWorkflowDefinitionZodSchemaWithContext = (ctx?: IWorkflowDefinitionZodCtx) => {
  void ctx
  return workflowDefinitionZodSchema.strict()
}
