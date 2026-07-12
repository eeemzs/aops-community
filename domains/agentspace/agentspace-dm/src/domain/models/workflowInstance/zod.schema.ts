import { z } from 'zod'
import { IbmZodSchema } from '@aopslab/xf-bm'
import { IWorkflowInstanceZodCtx } from './resources.js'

export const workflowInstanceZodSchema = z.object({
  ...IbmZodSchema.shape,
    scopeId: z.string(),
  workflowInstanceId: z.string(),
  definitionId: z.string().nullable().optional(),
  mode: z.string(),
  status: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  subjectLabel: z.string().nullable().optional(),
  subjectMeta: z.unknown().nullable().optional(),
  input: z.unknown().nullable().optional(),
  currentStepId: z.string().nullable().optional(),
  activeApprovalId: z.string().nullable().optional(),
  runtimeProfile: z.string().nullable().optional(),
  runRecordIds: z.array(z.string()),
  steps: z.array(z.record(z.string(), z.unknown())),
  definitionSnapshot: z.unknown().nullable().optional(),
  meta: z.unknown().nullable().optional(),
  openedAt: z.date(),
  closedAt: z.date().nullable().optional(),
})

/* Insert schema */
export const workflowInstanceZodSchemaInsert = workflowInstanceZodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tenantId: true,
}).strict()

/* with context -> may not be used for all cases - is used when i18n is needed
   Create with context - resource must be defined and ctx must be provided
*/
export const createWorkflowInstanceZodSchemaWithContext = (ctx?: IWorkflowInstanceZodCtx) => {
  /*
    const { v, f, t, forField } = ctx ?? {}
    t?.('fields.sampleField.label')
  */
  return workflowInstanceZodSchema.strict()
}
