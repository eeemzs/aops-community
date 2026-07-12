import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IWorkflowStepRunZodCtx } from './resources.js'

export const workflowStepRunZodSchema = z.object({
  ...IbmZodSchema.shape,
    scopeId: z.string(),
  workflowId: z.string(),
  workflowInstanceId: z.string(),
  stepId: z.string(),
  sequence: z.number().int().positive(),
  kind: z.string(),
  title: z.string().nullable().optional(),
  status: z.string(),
  agentRunId: z.string().nullable().optional(),
  approvalId: z.string().nullable().optional(),
  childWorkflowId: z.string().nullable().optional(),
  childWorkflowInstanceId: z.string().nullable().optional(),
  input: z.unknown().nullable().optional(),
  approval: z.unknown().nullable().optional(),
  error: z.unknown().nullable().optional(),
  meta: z.unknown().nullable().optional(),
  openedAt: z.date(),
  closedAt: z.date().nullable().optional(),
})

/* Insert schema */
export const workflowStepRunZodSchemaInsert = workflowStepRunZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createWorkflowStepRunZodSchemaWithContext = (ctx?: IWorkflowStepRunZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return workflowStepRunZodSchema.strict()
}
